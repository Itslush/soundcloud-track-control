import { decodeCrossfade } from './crossfade-pcm.js';

export function createCrossfade({
  modules,
  graph,
  sourceFor,
  resolveSource = sourceFor,
  sourceStats = () => null,
  preloadNext,
  isCurrentTrack = () => false,
  readNextRate = () => 4,
  readNextSettings,
  readSettings,
  readTrack,
  nextButton,
  applySyncRate = null,
  onState,
  onVisual,
  storage = localStorage,
  timers = globalThis,
}) {
  const enabledKey = 'soundcloud.tempo.crossfade';
  const secondsKey = 'soundcloud.tempo.crossfadeSeconds';
  let enabled = false;
  let seconds = 5;
  let selected;
  let job;
  let warm;
  let warming;
  let warmRetry;
  let pendingNext;
  let staleIdentity;
  let staleRetries = 0;
  let timer;
  let syncPull = null;
  let message = '';
  let disposed = false;
  const history = [];
  const nextSettingsFor = (url) =>
    readNextSettings
      ? readNextSettings(url)
      : {
          ...readSettings(selected),
          rate: readNextRate(url),
        };
  const clean = (value) =>
    String(value)
      .replace(/https?:\/\/\S+/g, '[URL omitted]')
      .slice(0, 300);

  function setPull(audio, factor) {
    if (!applySyncRate || !audio) return;
    if (syncPull?.audio === audio && syncPull.factor === factor) return;
    const prev = syncPull?.audio;
    syncPull = factor === 1 ? null : { audio, factor };
    if (prev && prev !== audio) applySyncRate(prev);
    applySyncRate(audio);
  }

  function visual(state) {
    // Artwork must never interrupt the audio handoff.
    try {
      onVisual?.(state);
    } catch {}
  }

  function status(value) {
    value = clean(value);
    if (message === value) return;
    message = value;
    history.push({ at: new Date().toISOString(), message });
    if (history.length > 12) history.shift();
    onState?.();
  }

  function cancel(reason, keepPreload = false) {
    setPull(selected, 1);
    const previous = job;
    job = null;
    if (!keepPreload) {
      pendingNext?.controller.abort();
      pendingNext = null;
    }
    visual(null);
    previous?.controller.abort();
    previous?.prefetch?.controller.abort();
    try {
      if (!keepPreload) previous?.next?.dispose();
    } finally {
      previous?.route?.dispose();
    }
    if (previous && reason) status(`Crossfade cancelled: ${reason}.`);
  }

  function clearWarm() {
    warm?.controller.abort();
    warming?.controller.abort();
    warm = null;
    warming = null;
    warmRetry = null;
  }

  function startPreload(audio, track) {
    const controller = new AbortController();
    const pending = { audio, track, src: audio.currentSrc, controller };
    const promise = preloadNext(audio, { signal: controller.signal }).then(
      (next) => {
        pending.next = next;
        if (controller.signal.aborted) next.dispose();
        else
          controller.signal.addEventListener('abort', () => next.dispose(), {
            once: true,
          });
        return { next };
      },
      (error) => {
        if (error.code === 'SOUNDCLOUD_HOST_STALE') retryStale(pending);
        else pending.retryPosition = audio.currentTime + 2;
        return { error };
      },
    );
    pending.promise = promise;
    return pending;
  }

  function signature(audio) {
    const settings = readSettings(audio);
    return JSON.stringify([
      readTrack(),
      audio.currentSrc,
      audio.duration,
      settings.rate,
      settings.preserve,
      settings.shift,
      settings.variable,
    ]);
  }

  function keepVerifiedNext(current) {
    try {
      if (
        current.next &&
        pendingNext?.next === current.next &&
        canReusePreload(current.audio, readTrack())
      )
        return true;
    } catch {}
    pendingNext?.controller.abort();
    pendingNext = null;
    current.next = null;
    return false;
  }

  function retryStale(current) {
    const identity = JSON.stringify([current.track, current.audio.currentSrc]);
    if (staleIdentity !== identity) {
      staleIdentity = identity;
      staleRetries = 0;
    }
    if (staleRetries++ === 0)
      current.retryPosition = current.audio.currentTime + 2;
  }

  async function prepareOpening(current) {
    current.decodingOpening = true;
    status('Preparing the next track’s opening…');
    try {
      const settings = nextSettingsFor(current.next.trackUrl);
      if (settings.variable) {
        current.failedNextSettings = JSON.stringify(settings);
        throw new Error('The next track uses a tempo timeline.');
      }
      const url = current.next.streamUrl();
      const decoded = await decodeCrossfade(
        modules,
        graph,
        current,
        url,
        0,
        (seconds + 8) * settings.rate,
      );
      if (decoded.duration / settings.rate < seconds + 2)
        throw new Error('The next track is too short for this crossfade.');
      const opening = await graph.prepareIncoming(
        current.audio,
        decoded.buffer,
        settings,
        current.controller,
      );
      if (job !== current || current.controller.signal.aborted) return;
      if (!current.next.matches())
        throw Object.assign(new Error('The next queued track changed.'), {
          code: 'SOUNDCLOUD_HOST_STALE',
        });
      if (current.next.streamUrl() !== url) {
        current.failedNextStream = url;
        throw new Error('The next stream changed during preparation.');
      }
      current.opening = opening;
      current.openingUrl = url;
      current.nextSettings = settings;
      staleRetries = 0;
      status('Crossfade ready.');
    } catch (error) {
      if (job === current && !current.controller.signal.aborted) {
        current.failed = true;
        current.buffer = null;
        const hadNext = Boolean(current.next);
        if (!keepVerifiedNext(current) && hadNext) retryStale(current);
        status(`Playing normally. ${error.message}`);
      }
    } finally {
      current.decodingOpening = false;
    }
  }

  async function prepare(current) {
    try {
      const { signal } = current.controller;
      current.waitingNext = true;
      if (current.preloaded) {
        const result = await current.preloaded;
        if (result.error) throw result.error;
        current.next = result.next;
      } else current.next = await preloadNext(current.audio, { signal });
      current.waitingNext = false;
      if (job !== current || signal.aborted) return;
      current.waitingSource = true;
      status('Identifying the current track’s audio…');
      const source = await resolveSource(current.audio, { signal });
      if (job !== current || signal.aborted) return;
      current.waitingSource = false;
      if (source.status !== 'bound')
        throw new Error('This track’s audio could not be identified.');
      current.sourceId = source.sourceId;
      current.generation = source.generation;
      current.sourceUrl = source.playlistUrl;
      const { buffer, duration, start } = await decodeCrossfade(
        modules,
        graph,
        current,
        source.playlistUrl,
        current.start,
      );
      if (
        !Number.isFinite(duration) ||
        Math.abs(duration - current.audio.duration) > 0.25
      )
        throw new Error('This stream’s timing is not suitable for crossfade.');
      if (job !== current || signal.aborted) return;
      const latest = await resolveSource(current.audio, { signal });
      if (job !== current || signal.aborted) return;
      if (signature(current.audio) !== current.signature) return;
      if (!sameSource(latest, current))
        throw new Error('The track changed while preparing crossfade.');
      current.start = start;
      current.buffer = buffer;
      status('Buffering the next track…');
    } catch (error) {
      if (job === current && error.name !== 'AbortError') {
        const waitingSource = current.waitingSource;
        current.failed = true;
        if (error.code === 'SOUNDCLOUD_QUEUE_PENDING')
          current.retryPosition =
            current.audio.currentTime + 2 * readSettings(current.audio).rate;
        if (error.code === 'SOUNDCLOUD_HOST_STALE') {
          if (pendingNext?.retryPosition !== undefined)
            current.retryPosition = pendingNext.retryPosition;
          else retryStale(current);
        }
        if (waitingSource) {
          try {
            current.retryWhenBound =
              sourceFor(current.audio).status !== 'bound';
          } catch {}
        }
        current.waitingNext = false;
        current.waitingSource = false;
        const hadNext = Boolean(current.next);
        if (
          !keepVerifiedNext(current) &&
          hadNext &&
          error.code !== 'SOUNDCLOUD_HOST_STALE'
        )
          retryStale(current);
        status(
          `Playing normally. ${
            waitingSource
              ? 'This track’s audio could not be identified. See crossfade diagnostics.'
              : error.message
          }`,
        );
      }
    }
  }

  function warmManual() {
    const audio = selected;
    if (!enabled || disposed || !audio || audio.paused || audio.seeking) return;
    const track = readTrack();
    if (!track || !Number.isFinite(audio.duration)) return;
    const settings = readSettings(audio);
    if (settings.variable || !graph.crossfadeReady(audio, settings)) return;
    if (
      job?.route ||
      (job &&
        !job.failed &&
        !job.opening &&
        (!job.buffer || job.decodingOpening))
    )
      return;
    const start = audio.currentTime;
    if ((audio.duration - start) / settings.rate < 0.5) return;
    const sig = signature(audio);
    if (warming?.signature === sig) return;
    if (warmRetry?.signature === sig && start < warmRetry.position) return;
    const end = warm?.tail && warm.tail.start + warm.tail.buffer.duration;
    if (
      warm?.signature === sig &&
      (end >= audio.duration - 0.01 ||
        (end - start) / settings.rate >= seconds + 2)
    )
      return;
    warming?.controller.abort();
    const current = (warming = {
      audio,
      track,
      start,
      signature: sig,
      controller: new AbortController(),
    });
    void (async () => {
      try {
        const source = await resolveSource(audio, current.controller);
        if (warming !== current || source.status !== 'bound') return;
        const tail = await decodeCrossfade(
          modules,
          graph,
          current,
          source.playlistUrl,
          start,
          (seconds + 8) * settings.rate,
        );
        const latest = sourceFor(audio);
        if (
          warming !== current ||
          signature(audio) !== current.signature ||
          !sameSource(latest, source) ||
          Math.abs(tail.duration - audio.duration) > 0.25
        )
          return;
        current.tail = tail;
        current.source = source;
        warm?.controller.abort();
        warm = current;
        warmRetry = null;
      } catch {
      } finally {
        if (warming === current) {
          warming = null;
          if (warm !== current)
            warmRetry = { signature: sig, position: start + 5 * settings.rate };
        }
      }
    })();
  }

  function sameSource(source, ref) {
    const url = ref?.playlistUrl ?? ref?.sourceUrl;
    return Boolean(
      source.status === 'bound' &&
        ref &&
        source.sourceId === ref.sourceId &&
        source.generation === ref.generation &&
        source.playlistUrl === url,
    );
  }

  function openingReady(current) {
    return Boolean(
      current?.opening &&
        current.next?.matches() &&
        JSON.stringify(nextSettingsFor(current.next.trackUrl)) ===
          JSON.stringify(current.nextSettings) &&
        current.next.streamUrl() === current.openingUrl,
    );
  }

  function startOverlap(current, audio, buffer, offset, rate, overlap) {
    Object.assign(current, {
      position: audio.currentTime,
      duration: audio.duration,
      outgoingRate: rate,
      overlapSeconds: overlap,
    });
    current.route = graph.beginCrossfade(
      audio, buffer, offset, rate, overlap, current.opening,
    );
    clearWarm();
    current.buffer = current.opening = null;
    visual({
      track: current.track, position: current.position, duration: current.duration,
      paused: false, nextTrack: current.next.trackUrl, nextPosition: 0, progress: 0,
    });
    status('Crossfading buffered audio…');
  }

  function canReusePreload(audio, track) {
    return Boolean(
      pendingNext && pendingNext.audio === audio && pendingNext.track === track &&
        pendingNext.src === audio.currentSrc && (!pendingNext.next || pendingNext.next.matches()),
    );
  }

  function manualPlay(target, seek = false) {
    const current = warm, audio = selected;
    if (
      !current?.tail || !target || (target === '*' ? seek : (target === readTrack()) !== seek) ||
      audio !== current.audio || audio.paused || audio.seeking || signature(audio) !== current.signature
    )
      return false;
    const settings = readSettings(audio);
    const offset = audio.currentTime - current.tail.start;
    const overlap = Math.min(seconds, (current.tail.buffer.duration - offset) / settings.rate);
    if (!graph.crossfadeReady(audio, settings) || !sameSource(sourceFor(audio), current.source) || offset < 0 || overlap < 0.5)
      return false;
    warm = null; warming?.controller.abort(); warming = null;
    cancel();
    Object.assign(current, { target, seek, oldSrc: audio.currentSrc, position: audio.currentTime, overlapSeconds: overlap });
    job = current;
    try {
      current.route = graph.beginCrossfade(audio, current.tail.buffer, offset, settings.rate, overlap, null, true);
      current.tail = null;
      status('Crossfading into the selected track…');
    } catch {
      cancel();
      return false;
    }
    return true;
  }

  function manualNext() {
    const audio = selected;
    if (!enabled || disposed || !audio || audio.paused || audio.seeking) return false;
    const settings = readSettings(audio);
    if (settings.variable || !graph.crossfadeReady(audio, settings)) return false;
    if (job && !job.route && !job.failed && openingReady(job)) {
      const source = sourceFor(audio);
      const tail =
        warm?.tail && warm.audio === audio && warm.signature === signature(audio) && sameSource(source, warm.source)
          ? warm.tail
          : sameSource(source, job) && job.buffer && audio.currentTime >= job.start
            ? { buffer: job.buffer, start: job.start }
            : null;
      const offset = tail ? audio.currentTime - tail.start : -1;
      const overlap = tail ? Math.min(seconds, (tail.buffer.duration - offset) / settings.rate) : 0;
      if (tail && offset >= 0 && overlap >= 0.5) {
        try { startOverlap(job, audio, tail.buffer, offset, settings.rate, overlap); return true; }
        catch { cancel(); }
      }
    }
    return manualPlay(nextTrack() || '*', false);
  }

  function tick() {
    const audio = selected;
    if (!enabled || disposed || !audio) return;
    if (job?.target) {
      const current = job;
      if (!current.route) return;
      if (current.seek && current.route.valid?.() === false) {
        cancel('player routing changed');
        return;
      }
      const remaining =
        current.route.endTime - current.route.context.currentTime;
      if (
        current.loadingPause &&
        audio.paused &&
        current.route.context.currentTime - current.route.startedAt >= 2
      ) {
        cancel('player pause');
        return;
      }
      if (!audio.paused) current.loadingPause = false;
      const track = readTrack();
      const matchesTarget =
        current.target === '*'
          ? Boolean(track && track !== current.track)
          : track === current.target;
      const targetIsCurrent =
        !current.seek && matchesTarget && isCurrentTrack(audio, track);
      if (!current.prefetch && targetIsCurrent && !audio.paused) {
        current.prefetch = startPreload(audio, track);
      }
      if (
        remaining <= 0 ||
        current.route.context.state !== 'running' ||
        (track &&
          track !== current.track &&
          !(current.incomingTrack
            ? track === current.incomingTrack
            : matchesTarget))
      ) {
        const prefetch = current.prefetch;
        const promote =
          prefetch &&
          track === prefetch.track &&
          audio === prefetch.audio &&
          !audio.paused;
        if (promote) current.prefetch = null;
        cancel();
        if (promote) pendingNext = prefetch;
        return;
      }
      if (current.seek && current.seeked) {
        const source = sourceFor(audio);
        if (source.status !== 'bound') return;
        if (audio !== current.audio || !sameSource(source, current.source)) {
          cancel('seeked track changed');
          return;
        }
      }
      if (
        !current.fading &&
        matchesTarget &&
        !audio.paused &&
        !audio.seeking &&
        audio.readyState >= 2 &&
        (current.seek ? current.seeked : targetIsCurrent) &&
        graph.crossfadeReady(audio, readSettings(audio))
      ) {
        current.incomingTrack = track;
        current.fading = current.route.fadeIn(audio, remaining);
      }
      return;
    }
    if (job?.route) {
      const current = job;
      const progress = Math.max(0, Math.min(1, 1 - (current.route.overlapEnd - current.route.context.currentTime) / current.overlapSeconds));
      visual({
        track: current.track,
        position: current.position + current.route.position() * current.outgoingRate,
        duration: current.duration,
        paused: current.route.context.state !== 'running',
        nextTrack: current.next.trackUrl,
        nextPosition: current.route.position() * current.nextSettings.rate,
        progress,
      });
      const remaining = current.route.endTime - current.route.context.currentTime;
      if (remaining <= 0 || current.route.context.state !== 'running') {
        cancel();
        status(
          current.fading
            ? 'Crossfade complete.'
            : 'The buffered opening ended before SoundCloud could synchronize; native playback restored.',
        );
        return;
      }
      const track = readTrack();
      if (track && track !== current.track) {
        if (current.incomingTrack && current.incomingTrack !== track) {
          cancel();
          return;
        }
        current.incomingTrack = track;
      }
      current.route.silence(audio);
      const changed =
        audio !== current.audio || audio.currentTime < current.position - 0.5;
      if (
        !current.fading &&
        current.incomingTrack &&
        changed &&
        !audio.paused &&
        !audio.seeking &&
        audio.readyState >= 2 &&
        graph.crossfadeReady(audio, readSettings(audio))
      ) {
        if (!current.next.isCurrent(audio)) {
          cancel();
          status('The queued track changed; playing normally.');
          return;
        }
        const actual = readSettings(audio);
        const expected = current.nextSettings;
        if (
          actual.variable ||
          actual.rate !== expected.rate ||
          actual.preserve !== expected.preserve ||
          actual.shift !== expected.shift
        ) {
          cancel('incoming tempo or pitch changed');
          return;
        }
        const now = current.route.context.currentTime;
        const desired = current.route.position() * expected.rate;
        const audible = current.route.nativePosition(audio);
        current.handoffError = audible - desired;
        const absErr = Math.abs(current.handoffError);
        const tight = Boolean(applySyncRate) && now < current.route.endTime - 1.5;
        const tol = (tight ? 0.005 : 0.02) * expected.rate;
        if (absErr > tol) {
          if (tight && absErr <= 0.18 * expected.rate) {
            setPull(audio, Math.max(0.96, Math.min(1.04, 1 - current.handoffError / (0.6 * expected.rate))));
            status('Crossfading; locking SoundCloud timing…');
          } else if (now >= (current.seekAfter ?? 0)) {
            setPull(audio, 1);
            if (current.seekLead !== undefined && current.handoffError < 0)
              current.seekLead = Math.min(0.6 * expected.rate, current.seekLead + Math.min(0.4 * expected.rate, -current.handoffError * 0.85));
            else current.seekLead ??= 0;
            // Seek only the verified native next track, while its output is masked by the opening buffer.
            audio.currentTime = desired + Math.max(0, audio.currentTime - audible) + current.seekLead;
            current.seekAfter = now + 0.75;
            status('Crossfading; synchronizing SoundCloud underneath…');
          }
        } else {
          setPull(audio, 1);
          if (now >= current.route.overlapEnd) {
            current.fading = current.route.fadeIn(audio);
            if (current.fading) status('Returning to synchronized native playback…');
          }
        }
      }
      return;
    }
    if (audio.paused || audio.seeking) return;
    const settings = readSettings(audio);
    const track = readTrack();
    const currentSignature = signature(audio);
    const samePreload = canReusePreload(audio, track);
    if (job && job.signature !== currentSignature)
      cancel('track or tempo changed', Boolean(samePreload));
    if (job?.next && !job.next.matches()) cancel('queue changed');
    if (job?.failed && audio.currentTime >= job.retryPosition)
      cancel(undefined, Boolean(samePreload));
    if (
      job?.failed &&
      job.retryWhenBound &&
      sourceFor(audio).status === 'bound'
    )
      cancel(undefined, Boolean(samePreload));
    if (
      job?.failedNextSettings &&
      job.next &&
      JSON.stringify(nextSettingsFor(job.next.trackUrl)) !==
        job.failedNextSettings
    )
      cancel(undefined, Boolean(samePreload));
    if (
      job?.failedNextStream &&
      job.next &&
      job.next.streamUrl() !== job.failedNextStream
    )
      cancel(undefined, Boolean(samePreload));
    if (
      pendingNext &&
      (!samePreload || audio.currentTime >= pendingNext.retryPosition)
    ) {
      pendingNext.controller.abort();
      pendingNext = null;
    }
    if (!job && !pendingNext && track) pendingNext = startPreload(audio, track);
    if (!track) return;
    if (settings.variable) {
      status('Crossfade waits until the tempo timeline is steady.');
      return;
    }
    if (!Number.isFinite(audio.duration)) return;
    const remaining = (audio.duration - audio.currentTime) / settings.rate;
    if (!graph.crossfadeReady(audio, settings)) {
      status('Crossfade needs a ready player audio connection.');
      return;
    }
    if (job?.failed) warmManual();
    if (audio.duration / settings.rate < seconds * 2 + 2 || remaining < 0.5) {
      if (remaining >= 0.5) warmManual();
      status('Playing normally. Not enough track time for crossfade.');
      return;
    }
    if (!job) {
      warming?.controller.abort();
      warming = null;
      const prefetch = pendingNext;
      job = {
        audio,
        track: readTrack(),
        signature: currentSignature,
        start: Math.max(0, audio.duration - (seconds + 2) * settings.rate),
        controller: new AbortController(),
        preloaded: prefetch?.promise,
      };
      status('Preloading the next track…');
      void prepare(job);
    }
    if (!job?.buffer) return;
    const nextRate = readNextRate(job.next.trackUrl);
    job.requiredSeconds =
      (seconds + 1) *
      (Number.isFinite(nextRate) && nextRate >= 0.25 && nextRate <= 4
        ? nextRate
        : 4);
    job.nextReady = job.next.ready(job.requiredSeconds);
    if (!job.nextReady) {
      status('Buffering the next track; playback continues normally.');
      return;
    }
    if (!job.opening) {
      if (!job.decodingOpening) {
        warming?.controller.abort();
        warming = null;
        void prepareOpening(job);
      }
      return;
    }
    if (!openingReady(job)) {
      cancel('next track settings changed', true);
      return;
    }
    status('Crossfade ready.');
    if (remaining > seconds + 1) warmManual();
    if (remaining > seconds) return;
    const button = nextButton();
    if (!button) {
      status('Crossfade needs another track in the queue.');
      return;
    }
    const current = job;
    const source = sourceFor(audio);
    if (
      source.status === 'unbound' &&
      source.reason === 'waiting-for-payload-proof' &&
      source.sourceId === current.sourceId &&
      source.generation === current.generation
    ) {
      status('Waiting for stream verification; playback continues normally.');
      return;
    }
    if (!sameSource(source, current)) {
      cancel('stream identity changed');
      return;
    }
    try {
      startOverlap(
        current,
        audio,
        current.buffer,
        audio.currentTime - current.start,
        settings.rate,
        remaining,
      );
      button.click();
    } catch (error) {
      current.route?.dispose();
      current.route = null;
      visual(null);
      status(`Playing normally. ${error.message}`);
    }
  }

  function safeTick() {
    try {
      tick();
    } catch (error) {
      cancel();
      status(`Crossfade stopped. ${error.message}`);
    }
  }

  function reload() {
    cancel();
    clearWarm();
    staleIdentity = undefined;
    staleRetries = 0;
    try {
      enabled = storage.getItem(enabledKey) === 'true';
      const value = Number(storage.getItem(secondsKey));
      seconds =
        Number.isInteger(value) && value >= 1 && value <= 10 ? value : 5;
    } catch {
      enabled = false;
    }
    timers.clearInterval(timer);
    timer = enabled ? timers.setInterval(safeTick, 100) : undefined;
    status(
      enabled
        ? 'Crossfade enabled. Unavailable streams play normally.'
        : 'Crossfade off.',
    );
    onState?.();
  }

  const events = ['pause', 'seeking', 'seeked', 'playing'];
  function mediaEvent(event) {
    if (job?.target && job.seek && event.type === 'seeking') {
      if (job.seeking) return cancel('player seeking again');
      job.seeking = true;
      return;
    }
    if (job?.target && job.seek && job.seeking && event.type === 'seeked') {
      job.seeked = true;
      safeTick();
      return;
    }
    if (event.type === 'seeked') return;
    if (event.type === 'playing') {
      const track = readTrack();
      if (
        job?.target &&
        !job.seek &&
        track &&
        (job.target === '*' ? track !== job.track : track === job.target) &&
        isCurrentTrack(selected, track)
      )
        job.targetStarted = true;
      safeTick();
      return;
    }
    // Loading the next track may pause/seek the reused element before it starts.
    if (
      job?.route &&
      !job.seek &&
      !job.fading &&
      (event.type === 'seeking' ||
        (!job.target && !job.incomingTrack) ||
        (event.type === 'pause' &&
          job.target &&
          !job.targetStarted &&
          job.route.context.currentTime - job.route.startedAt < 2))
    ) {
      if (event.type === 'pause' && job.target) job.loadingPause = true;
      return;
    }
    if (event.type === 'pause') {
      staleIdentity = undefined;
      staleRetries = 0;
    }
    clearWarm();
    cancel(`player ${event.type}`);
  }

  function nextTrack() {
    const next = job?.prefetch?.next ?? pendingNext?.next;
    try {
      return next?.matches() ? next.trackUrl : '';
    } catch {
      return '';
    }
  }

  function diagnosticStage() {
    if (job?.target && !job.route) return 'preparing-manual-transition';
    if (job?.failed) return 'unavailable';
    if (job?.waitingNext) return 'finding-next-track';
    if (job?.waitingSource) return 'identifying-source';
    if (job?.fading) return 'handing-off';
    if (job?.route) return 'buffered-overlap';
    if (job?.decodingOpening) return 'decoding-incoming';
    if (job?.nextReady) return 'ready';
    if (job?.buffer) return 'waiting-for-next-buffer';
    if (job?.next) return 'decoding-outgoing';
    if (pendingNext?.next) return 'preloaded';
    return pendingNext ? 'finding-next-track' : 'idle';
  }

  return {
    manualPlay,
    manualNext,
    syncRate: (audio) => (syncPull?.audio === audio ? syncPull.factor : 1),
    warmManual,
    nextTrack,
    enabled: () => enabled,
    seconds: () => seconds,
    label: () => message,
    diagnostics() {
      const audio = selected;
      const round = (value) =>
        Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
      let player = null;
      try {
        const source = audio && sourceFor(audio);
        player = audio
          ? {
              paused: audio.paused,
              seeking: audio.seeking,
              readyState: audio.readyState,
              position: round(audio.currentTime),
              duration: round(audio.duration),
              source: source.status,
              sourceReason: source.reason ?? null,
              sourceProof: source.proof ?? null,
              sourceCapture: sourceStats(),
              graphReady: graph.crossfadeReady(audio, readSettings(audio)),
              rate: readSettings(audio).rate,
              nextBufferedSeconds: round((job?.prefetch?.next ?? job?.next ?? pendingNext?.next)?.bufferedSeconds?.()),
              seekBridgeSeconds:
                warm?.audio === audio
                  ? round((warm.tail.start + warm.tail.buffer.duration - audio.currentTime) / readSettings(audio).rate)
                  : null,
              requiredSeconds: round(job?.requiredSeconds),
              handoffErrorSeconds: round(job?.handoffError),
              openingSecondsRemaining: job?.route ? round(job.route.endTime - job.route.context.currentTime) : null,
            }
          : null;
      } catch (error) {
        player = { error: clean(error.message) };
      }
      return {
        enabled,
        overlapSeconds: seconds,
        status: message,
        stage: diagnosticStage(),
        player,
        history: history.map((entry) => ({ ...entry })),
      };
    },
    reload,
    set(nextEnabled, nextSeconds) {
      if (
        typeof nextEnabled !== 'boolean' ||
        !Number.isInteger(nextSeconds) ||
        nextSeconds < 1 ||
        nextSeconds > 10
      )
        throw new TypeError('Choose a crossfade between 1 and 10 seconds.');
      storage.setItem(secondsKey, String(nextSeconds));
      storage.setItem(enabledKey, String(nextEnabled));
      reload();
    },
    select(audio) {
      if (selected === audio) {
        job?.route?.silence(audio);
        return;
      }
      setPull(selected, 1);
      for (const event of events)
        selected?.removeEventListener(event, mediaEvent);
      if (!job?.route) cancel('selected player changed');
      clearWarm();
      selected = audio;
      for (const event of events) audio.addEventListener(event, mediaEvent);
      job?.route?.silence(audio);
    },
    cancel: () => {
      clearWarm();
      cancel('playback controls changed');
    },
    settingsChanged() {
      let keep = false;
      try {
        keep = canReusePreload(selected, readTrack());
      } catch {}
      clearWarm();
      cancel('tempo or pitch changed', keep);
    },
    dispose() {
      disposed = true;
      setPull(selected, 1);
      clearWarm();
      cancel();
      timers.clearInterval(timer);
      for (const event of events)
        selected?.removeEventListener(event, mediaEvent);
      selected = null;
    },
  };
}
