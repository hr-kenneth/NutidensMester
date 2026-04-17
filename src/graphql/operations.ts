export const LIST_MY_GROUPS = /* GraphQL */ `
  query ListMyGroups {
    listMyGroups {
      groupId name memberCount createdAt mesterName currentCycleNumber roundsPlayedInCycle
    }
  }
`;

export const LIST_MEMBERS = /* GraphQL */ `
  query ListMembers($groupId: ID!) {
    listMembers(groupId: $groupId) {
      groupId username displayName joinedAt
    }
  }
`;

export const LIST_ROUNDS_IN_CYCLE = /* GraphQL */ `
  query ListRoundsInCycle($groupId: ID!, $cycleNumber: Int!) {
    listRoundsInCycle(groupId: $groupId, cycleNumber: $cycleNumber) {
      cycleNumber roundNumber winner winnerDisplayName recordedBy recordedAt
    }
  }
`;

export const CREATE_GROUP = /* GraphQL */ `
  mutation CreateGroup($name: String!, $displayName: String!) {
    createGroup(name: $name, displayName: $displayName) {
      groupId name memberCount createdAt mesterName currentCycleNumber roundsPlayedInCycle
    }
  }
`;

export const JOIN_GROUP = /* GraphQL */ `
  mutation JoinGroup($groupId: ID!, $displayName: String!) {
    joinGroup(groupId: $groupId, displayName: $displayName) {
      groupId username displayName joinedAt
    }
  }
`;

export const RECORD_ROUND = /* GraphQL */ `
  mutation RecordRound($groupId: ID!, $winner: String!) {
    recordRound(groupId: $groupId, winner: $winner) {
      groupId cycleNumber roundNumber winner winnerDisplayName recordedBy recordedAt
    }
  }
`;

export const ON_ROUND_ADDED = /* GraphQL */ `
  subscription OnRoundAdded($groupId: ID!) {
    onRoundAdded(groupId: $groupId) {
      groupId cycleNumber roundNumber winner winnerDisplayName recordedBy recordedAt
    }
  }
`;
