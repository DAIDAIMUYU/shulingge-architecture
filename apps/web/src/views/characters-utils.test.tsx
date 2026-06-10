import assert from "node:assert/strict";
import test from "node:test";

import type { Character, Relation, TimelineEvent } from "../api/client.js";
import {
  createCharacterFormDraft,
  filterCharacters,
  getCharacterRelations,
  getCharacterTimelineEvents,
  parseListMap,
  parseStringMap,
  toCharacterPayload,
} from "./characters-utils.js";

test("character draft and payload helpers preserve voice and rule fields", () => {
  const source: Character = {
    id: "kanae",
    name: "Kanae",
    links: ["[[Butterfly Mansion]]"],
    voice: {
      typicalLines: ["Stay calm."],
      forbiddenLines: ["Cruel line"],
      honorifics: { shinobu: "Shinobu" },
      bySituation: { combat: ["Keep formation", "Watch the flank"] },
      byEmotion: { grief: ["Take a breath"] },
      byRelationStage: { trust: ["I know your pace"] },
    },
    forbiddenWrites: ["out-of-character rage"],
    relatedWorldbook: ["wb-butterfly-mansion"],
    knowledgeScopeRef: "states/knowledge.json",
    currentStateRef: "states/kanae.state.json",
    arcRef: "arc-healing",
  };

  const draft = createCharacterFormDraft(source);
  const payload = toCharacterPayload(draft);

  assert.equal(draft.typicalLinesText, "Stay calm.");
  assert.equal(payload.voice?.honorifics?.shinobu, "Shinobu");
  assert.deepEqual(payload.voice?.bySituation?.combat, ["Keep formation", "Watch the flank"]);
  assert.equal(payload.forbiddenWrites?.[0], "out-of-character rage");
  assert.equal(payload.relatedWorldbook?.[0], "wb-butterfly-mansion");
});

test("character helpers parse maps and filter related records", () => {
  const characters: Character[] = [
    { id: "kanae", name: "Kanae", links: ["蝶屋"], forbiddenWrites: [], relatedWorldbook: ["wb-a"] },
    { id: "shinobu", name: "Shinobu", links: ["药房"], forbiddenWrites: [], relatedWorldbook: ["wb-b"] },
  ];
  const relations: Relation[] = [
    { id: "rel-1", from: "kanae", to: "shinobu", type: "sisters" },
    { id: "rel-2", from: "giyu", to: "tanjiro", type: "mentor" },
  ];
  const timeline: TimelineEvent[] = [
    { id: "ev-1", title: "Arrival", participants: ["kanae"], line: "main", order: 1, boundChapters: [] },
    { id: "ev-2", title: "Elsewhere", participants: ["giyu"], line: "main", order: 2, boundChapters: [] },
  ];

  assert.deepEqual(parseStringMap("shinobu: 小忍\nkanroji: 蜜璃"), {
    shinobu: "小忍",
    kanroji: "蜜璃",
  });
  assert.deepEqual(parseListMap("combat: 前压 | 收束\npeace: 喝茶"), {
    combat: ["前压", "收束"],
    peace: ["喝茶"],
  });
  assert.equal(filterCharacters(characters, "蝶屋")[0]?.id, "kanae");
  assert.equal(getCharacterRelations(relations, "kanae").length, 1);
  assert.equal(getCharacterTimelineEvents(timeline, "kanae")[0]?.id, "ev-1");
});
