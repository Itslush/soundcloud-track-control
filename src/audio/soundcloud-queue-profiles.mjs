export const legacyQueueMethods = [
  [
    'getCurrentSound',
    'function(){var e=W.getCurrentQueueItem();return null==e?void 0:e.sound}',
  ],
  ['getCurrentQueueItem', 'function(){return P.at(I)}'],
];

export const queueProfiles = [
  {
    id: '18',
    methods: [
      [
        'getCurrentSound',
        'function(){var e=K.getCurrentQueueItem();return null==e?void 0:e.sound}',
      ],
      ['getCurrentQueueItem', 'function(){return I.at(R)}'],
      ['getQueue', 'function(){return I}'],
      ['getQueueState', 'function(){return{currentIndex:R,repeatMode:q}}'],
    ],
    pullNext:
      'function(e){u&&!u.stream.isEnded()&&(M=Math.max(M,e))>0&&u.stream.resume()}',
  },
  {
    id: '20',
    methods: [
      ...legacyQueueMethods,
      ['getQueue', 'function(){return P}'],
      ['getQueueState', 'function(){return{currentIndex:I,repeatMode:j}}'],
    ],
    pullNext:
      'function(e){s&&!s.stream.isEnded()&&(O=Math.max(O,e))>0&&s.stream.resume()}',
  },
];
