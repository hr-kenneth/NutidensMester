import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer

TABLE_NAME = os.environ["TABLE_NAME"]

_resource = boto3.resource("dynamodb")
_table = _resource.Table(TABLE_NAME)
_client = boto3.client("dynamodb")
_serializer = TypeSerializer()


def _pad(n: int) -> str:
    return str(n).zfill(8)


def _to_int(v) -> int:
    return int(v) if isinstance(v, Decimal) else v


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _serialize(item: dict) -> dict:
    return {k: _serializer.serialize(v) for k, v in item.items() if v is not None}


def _item_to_group(item: dict) -> dict:
    return {
        "groupId":             item["groupId"],
        "name":                item["name"],
        "memberCount":         _to_int(item["memberCount"]),
        "createdAt":           item["createdAt"],
        "mesterName":          item.get("mesterName"),
        "currentCycleNumber":  _to_int(item["currentCycleNumber"]),
        "roundsPlayedInCycle": _to_int(item["roundsPlayedInCycle"]),
    }


def handler(event, context):
    field_name = event["info"]["fieldName"]
    args = event.get("arguments", {})
    user_id = event["identity"]["username"]

    dispatch = {
        "listMyGroups":      lambda: list_my_groups(user_id),
        "listMembers":       lambda: list_members(args["groupId"], user_id),
        "listRoundsInCycle": lambda: list_rounds_in_cycle(args["groupId"], int(args["cycleNumber"]), user_id),
        "createGroup":       lambda: create_group(args["name"], args["displayName"], user_id),
        "joinGroup":         lambda: join_group(args["groupId"], args["displayName"], user_id),
        "recordRound":       lambda: record_round(args["groupId"], args["winner"], user_id),
    }

    fn = dispatch.get(field_name)
    if not fn:
        raise Exception(f"Unknown field: {field_name}")
    return fn()


def _get_group(group_id: str) -> dict:
    resp = _table.get_item(Key={"PK": f"GROUP#{group_id}", "SK": "#META"})
    if "Item" not in resp:
        raise Exception("Group not found")
    return resp["Item"]


def _assert_member(group_id: str, user_id: str):
    resp = _table.get_item(Key={"PK": f"GROUP#{group_id}", "SK": f"MEMBER#{user_id}"})
    if "Item" not in resp:
        raise Exception("Not a member of this group")


def list_my_groups(user_id: str):
    resp = _table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"USER#{user_id}"),
    )
    items = resp.get("Items", [])
    if not items:
        return []

    batch_resp = _resource.batch_get_item(
        RequestItems={
            TABLE_NAME: {"Keys": [{"PK": item["PK"], "SK": "#META"} for item in items]}
        }
    )
    return [_item_to_group(g) for g in batch_resp["Responses"].get(TABLE_NAME, [])]


def list_members(group_id: str, user_id: str):
    _assert_member(group_id, user_id)
    resp = _table.query(
        KeyConditionExpression=Key("PK").eq(f"GROUP#{group_id}") & Key("SK").begins_with("MEMBER#")
    )
    return [
        {
            "groupId":     group_id,
            "username":    item["username"],
            "displayName": item["displayName"],
            "joinedAt":    item["joinedAt"],
        }
        for item in resp.get("Items", [])
    ]


def list_rounds_in_cycle(group_id: str, cycle_number: int, user_id: str):
    _assert_member(group_id, user_id)
    resp = _table.query(
        KeyConditionExpression=Key("PK").eq(f"GROUP#{group_id}")
            & Key("SK").begins_with(f"ROUND#{_pad(cycle_number)}|")
    )
    return [
        {
            "groupId":           group_id,
            "cycleNumber":       _to_int(item["cycleNumber"]),
            "roundNumber":       _to_int(item["roundNumber"]),
            "winner":            item["winner"],
            "winnerDisplayName": item["winnerDisplayName"],
            "recordedBy":        item["recordedBy"],
            "recordedAt":        item["recordedAt"],
        }
        for item in resp.get("Items", [])
    ]


def create_group(name: str, display_name: str, user_id: str):
    group_id = str(uuid.uuid4())
    now = _now()

    _client.transact_write_items(TransactItems=[
        {
            "Put": {
                "TableName": TABLE_NAME,
                "Item": _serialize({
                    "PK": f"GROUP#{group_id}", "SK": "#META",
                    "type": "GROUP", "groupId": group_id, "name": name,
                    "memberCount": 1, "currentCycleNumber": 1,
                    "roundsPlayedInCycle": 0, "createdAt": now, "createdBy": user_id,
                }),
                "ConditionExpression": "attribute_not_exists(PK)",
            }
        },
        {
            "Put": {
                "TableName": TABLE_NAME,
                "Item": _serialize({
                    "PK": f"GROUP#{group_id}", "SK": f"MEMBER#{user_id}",
                    "GSI1PK": f"USER#{user_id}", "GSI1SK": f"GROUP#{group_id}",
                    "type": "MEMBER", "groupId": group_id,
                    "username": user_id, "displayName": display_name, "joinedAt": now,
                }),
            }
        },
    ])

    return {
        "groupId": group_id, "name": name, "memberCount": 1, "createdAt": now,
        "mesterName": None, "currentCycleNumber": 1, "roundsPlayedInCycle": 0,
    }


def join_group(group_id: str, display_name: str, user_id: str):
    _get_group(group_id)
    now = _now()

    _client.transact_write_items(TransactItems=[
        {
            "Put": {
                "TableName": TABLE_NAME,
                "Item": _serialize({
                    "PK": f"GROUP#{group_id}", "SK": f"MEMBER#{user_id}",
                    "GSI1PK": f"USER#{user_id}", "GSI1SK": f"GROUP#{group_id}",
                    "type": "MEMBER", "groupId": group_id,
                    "username": user_id, "displayName": display_name, "joinedAt": now,
                }),
                "ConditionExpression": "attribute_not_exists(PK)",
            }
        },
        {
            "Update": {
                "TableName": TABLE_NAME,
                "Key": {"PK": {"S": f"GROUP#{group_id}"}, "SK": {"S": "#META"}},
                "UpdateExpression": "SET memberCount = memberCount + :one",
                "ExpressionAttributeValues": {":one": {"N": "1"}},
            }
        },
    ])

    return {"groupId": group_id, "username": user_id, "displayName": display_name, "joinedAt": now}


def record_round(group_id: str, winner: str, user_id: str):
    _assert_member(group_id, user_id)

    group = _get_group(group_id)
    winner_resp = _table.get_item(Key={"PK": f"GROUP#{group_id}", "SK": f"MEMBER#{winner}"})
    if "Item" not in winner_resp:
        raise Exception("Winner is not a member of this group")

    cycle_number      = _to_int(group["currentCycleNumber"])
    rounds_played     = _to_int(group["roundsPlayedInCycle"])
    member_count      = _to_int(group["memberCount"])
    new_round_number  = rounds_played + 1
    winner_name       = winner_resp["Item"]["displayName"]
    is_last_round     = new_round_number == member_count
    now               = _now()

    if is_last_round:
        update_expr = "SET currentCycleNumber = currentCycleNumber + :one, roundsPlayedInCycle = :zero, mesterName = :winner"
        expr_vals   = {":one": {"N": "1"}, ":zero": {"N": "0"}, ":winner": {"S": winner_name}}
    else:
        update_expr = "SET roundsPlayedInCycle = roundsPlayedInCycle + :one"
        expr_vals   = {":one": {"N": "1"}}

    _client.transact_write_items(TransactItems=[
        {
            "Put": {
                "TableName": TABLE_NAME,
                "Item": _serialize({
                    "PK": f"GROUP#{group_id}",
                    "SK": f"ROUND#{_pad(cycle_number)}|{_pad(new_round_number)}",
                    "type": "ROUND", "groupId": group_id,
                    "cycleNumber": cycle_number, "roundNumber": new_round_number,
                    "winner": winner, "winnerDisplayName": winner_name,
                    "recordedBy": user_id, "recordedAt": now,
                }),
                "ConditionExpression": "attribute_not_exists(PK)",
            }
        },
        {
            "Update": {
                "TableName": TABLE_NAME,
                "Key": {"PK": {"S": f"GROUP#{group_id}"}, "SK": {"S": "#META"}},
                "UpdateExpression": update_expr,
                "ExpressionAttributeValues": expr_vals,
            }
        },
    ])

    return {
        "groupId": group_id, "cycleNumber": cycle_number,
        "roundNumber": new_round_number, "winner": winner,
        "winnerDisplayName": winner_name, "recordedBy": user_id, "recordedAt": now,
    }
