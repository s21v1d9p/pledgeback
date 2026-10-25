/**
 * Pledgeback contract ABI — full, from the compiled artifact.
 * Includes events (for receipt decoding) and custom errors (for revert decoding).
 */
export const PLEDGEBACK_ABI = [
  // -------------------------------------------------------------------------
  // Write functions
  // -------------------------------------------------------------------------
  {
    type: 'function',
    name: 'create',
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'link', type: 'string' },
      { name: 'goal', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'pledge',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'addBonus',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'collect',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimRefund',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'reclaimBonus',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // -------------------------------------------------------------------------
  // Read functions
  // -------------------------------------------------------------------------
  {
    type: 'function',
    name: 'campaignCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'status',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCampaigns',
    inputs: [
      { name: 'startId', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        name: 'out',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'organizer', type: 'address' },
          { name: 'title', type: 'string' },
          { name: 'link', type: 'string' },
          { name: 'goal', type: 'uint256' },
          { name: 'pledged', type: 'uint256' },
          { name: 'bonusPool', type: 'uint256' },
          { name: 'deadline', type: 'uint64' },
          { name: 'collected', type: 'bool' },
          { name: 'status', type: 'uint8' },
          { name: 'backerCount', type: 'uint256' },
          { name: 'sponsorCount', type: 'uint256' },
          { name: 'guaranteeBps', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBackers',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      { name: 'addrs', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSponsors',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      { name: 'addrs', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'positionOf',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'who', type: 'address' },
    ],
    outputs: [
      { name: 'pledgeAmt', type: 'uint256' },
      { name: 'bonusAmt', type: 'uint256' },
      { name: 'refundDone', type: 'bool' },
      { name: 'bonusDone', type: 'bool' },
      { name: 'refundOwed', type: 'uint256' },
      { name: 'bonusOwed', type: 'uint256' },
      { name: 'collectOwed', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  {
    type: 'event',
    name: 'CampaignCreated',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'organizer', type: 'address', indexed: true },
      { name: 'goal', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
      { name: 'startingBonus', type: 'uint256', indexed: false },
      { name: 'title', type: 'string', indexed: false },
      { name: 'link', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Pledged',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'backer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'backerTotal', type: 'uint256', indexed: false },
      { name: 'campaignTotal', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BonusAdded',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'sponsor', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'bonusPool', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Collected',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'organizer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Refunded',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'backer', type: 'address', indexed: true },
      { name: 'pledge', type: 'uint256', indexed: false },
      { name: 'bonus', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BonusReclaimed',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'sponsor', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  // -------------------------------------------------------------------------
  // Custom errors
  // -------------------------------------------------------------------------
  { type: 'error', name: 'UnknownCampaign', inputs: [] },
  { type: 'error', name: 'CampaignClosed', inputs: [] },
  { type: 'error', name: 'CampaignOpen', inputs: [] },
  { type: 'error', name: 'GoalMet', inputs: [] },
  { type: 'error', name: 'GoalNotMet', inputs: [] },
  { type: 'error', name: 'NotOrganizer', inputs: [] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'AlreadyClaimed', inputs: [] },
  { type: 'error', name: 'InvalidGoal', inputs: [] },
  { type: 'error', name: 'InvalidDeadline', inputs: [] },
  { type: 'error', name: 'InvalidText', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
] as const
