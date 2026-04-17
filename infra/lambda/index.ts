import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  BatchGetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;

const pad = (n: number) => String(n).padStart(8, "0");

interface Identity { username: string }
interface Event {
  info: { fieldName: string };
  arguments: Record<string, unknown>;
  identity: Identity;
}

export const handler = async (event: Event) => {
  const { info: { fieldName }, arguments: args, identity } = event;
  const userId = identity.username;

  switch (fieldName) {
    case "listMyGroups":      return listMyGroups(userId);
    case "listMembers":       return listMembers(args.groupId as string, userId);
    case "listRoundsInCycle": return listRoundsInCycle(args.groupId as string, args.cycleNumber as number, userId);
    case "createGroup":       return createGroup(args.name as string, args.displayName as string, userId);
    case "joinGroup":         return joinGroup(args.groupId as string, args.displayName as string, userId);
    case "recordRound":       return recordRound(args.groupId as string, args.winner as string, userId);
    default: throw new Error(`Unknown field: ${fieldName}`);
  }
};

async function getGroup(groupId: string) {
  const res = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `GROUP#${groupId}`, SK: "#META" },
  }));
  if (!res.Item) throw new Error("Group not found");
  return res.Item;
}

async function assertMember(groupId: string, userId: string) {
  const res = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `GROUP#${groupId}`, SK: `MEMBER#${userId}` },
  }));
  if (!res.Item) throw new Error("Not a member of this group");
}

function itemToGroup(item: Record<string, unknown>): Record<string, unknown> {
  return {
    groupId:              item.groupId,
    name:                 item.name,
    memberCount:          item.memberCount,
    createdAt:            item.createdAt,
    mesterName:           item.mesterName ?? null,
    currentCycleNumber:   item.currentCycleNumber,
    roundsPlayedInCycle:  item.roundsPlayedInCycle,
  };
}

async function listMyGroups(userId: string) {
  const memberRes = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `USER#${userId}` },
  }));

  const items = memberRes.Items ?? [];
  if (items.length === 0) return [];

  const keys = items.map((i) => ({ PK: i.PK as string, SK: "#META" }));
  const batchRes = await ddb.send(new BatchGetCommand({
    RequestItems: { [TABLE]: { Keys: keys } },
  }));

  return (batchRes.Responses?.[TABLE] ?? []).map(itemToGroup);
}

async function listMembers(groupId: string, userId: string) {
  await assertMember(groupId, userId);

  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": `GROUP#${groupId}`, ":sk": "MEMBER#" },
  }));

  return (res.Items ?? []).map((i) => ({
    groupId,
    username:    i.username,
    displayName: i.displayName,
    joinedAt:    i.joinedAt,
  }));
}

async function listRoundsInCycle(groupId: string, cycleNumber: number, userId: string) {
  await assertMember(groupId, userId);

  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `GROUP#${groupId}`,
      ":sk": `ROUND#${pad(cycleNumber)}|`,
    },
  }));

  return (res.Items ?? []).map((i) => ({
    groupId,
    cycleNumber:       i.cycleNumber,
    roundNumber:       i.roundNumber,
    winner:            i.winner,
    winnerDisplayName: i.winnerDisplayName,
    recordedBy:        i.recordedBy,
    recordedAt:        i.recordedAt,
  }));
}

async function createGroup(name: string, displayName: string, userId: string) {
  const groupId = randomUUID();
  const now = new Date().toISOString();

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: `GROUP#${groupId}`,
            SK: "#META",
            type: "GROUP",
            groupId,
            name,
            memberCount: 1,
            currentCycleNumber: 1,
            roundsPlayedInCycle: 0,
            mesterName: null,
            createdAt: now,
            createdBy: userId,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: `GROUP#${groupId}`,
            SK: `MEMBER#${userId}`,
            GSI1PK: `USER#${userId}`,
            GSI1SK: `GROUP#${groupId}`,
            type: "MEMBER",
            groupId,
            username: userId,
            displayName,
            joinedAt: now,
          },
        },
      },
    ],
  }));

  return {
    groupId, name, memberCount: 1, createdAt: now,
    mesterName: null, currentCycleNumber: 1, roundsPlayedInCycle: 0,
  };
}

async function joinGroup(groupId: string, displayName: string, userId: string) {
  await getGroup(groupId); // verify group exists
  const now = new Date().toISOString();

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: `GROUP#${groupId}`,
            SK: `MEMBER#${userId}`,
            GSI1PK: `USER#${userId}`,
            GSI1SK: `GROUP#${groupId}`,
            type: "MEMBER",
            groupId,
            username: userId,
            displayName,
            joinedAt: now,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
      {
        Update: {
          TableName: TABLE,
          Key: { PK: `GROUP#${groupId}`, SK: "#META" },
          UpdateExpression: "SET memberCount = memberCount + :one",
          ExpressionAttributeValues: { ":one": 1 },
        },
      },
    ],
  }));

  return { groupId, username: userId, displayName, joinedAt: now };
}

async function recordRound(groupId: string, winner: string, userId: string) {
  await assertMember(groupId, userId);

  const [group, winnerMember] = await Promise.all([
    getGroup(groupId),
    ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `GROUP#${groupId}`, SK: `MEMBER#${winner}` },
    })),
  ]);

  if (!winnerMember.Item) throw new Error("Winner is not a member of this group");

  const cycleNumber:       number = group.currentCycleNumber as number;
  const roundsPlayed:      number = group.roundsPlayedInCycle as number;
  const memberCount:       number = group.memberCount as number;
  const newRoundNumber:    number = roundsPlayed + 1;
  const winnerDisplayName: string = winnerMember.Item.displayName as string;
  const isLastRound:       boolean = newRoundNumber === memberCount;
  const now = new Date().toISOString();

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: `GROUP#${groupId}`,
            SK: `ROUND#${pad(cycleNumber)}|${pad(newRoundNumber)}`,
            type: "ROUND",
            groupId,
            cycleNumber,
            roundNumber: newRoundNumber,
            winner,
            winnerDisplayName,
            recordedBy: userId,
            recordedAt: now,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
      {
        Update: {
          TableName: TABLE,
          Key: { PK: `GROUP#${groupId}`, SK: "#META" },
          UpdateExpression: isLastRound
            ? "SET currentCycleNumber = currentCycleNumber + :one, roundsPlayedInCycle = :zero, mesterName = :winner"
            : "SET roundsPlayedInCycle = roundsPlayedInCycle + :one",
          ExpressionAttributeValues: isLastRound
            ? { ":one": 1, ":zero": 0, ":winner": winnerDisplayName }
            : { ":one": 1 },
        },
      },
    ],
  }));

  return { groupId, cycleNumber, roundNumber: newRoundNumber, winner, winnerDisplayName, recordedBy: userId, recordedAt: now };
}
