import type { Character, CharacterInput, Relation, TimelineEvent } from "../api/client.js";

export interface CharacterFormDraft {
  id: string;
  name: string;
  linksText: string;
  typicalLinesText: string;
  forbiddenLinesText: string;
  honorificsText: string;
  bySituationText: string;
  byEmotionText: string;
  byRelationStageText: string;
  knowledgeScopeRef: string;
  currentStateRef: string;
  forbiddenWritesText: string;
  arcRef: string;
  relatedWorldbookText: string;
}

function linesToText(lines: string[] | undefined): string {
  return (lines ?? []).join("\n");
}

function mapToText(record: Record<string, string> | undefined): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function listMapToText(record: Record<string, string[]> | undefined): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}: ${value.join(" | ")}`)
    .join("\n");
}

export function createCharacterFormDraft(character?: Character): CharacterFormDraft {
  const voice = (character?.voice ?? {}) as CharacterInput["voice"];
  return {
    id: character?.id ?? "",
    name: character?.name ?? "",
    linksText: linesToText(character?.links as string[] | undefined),
    typicalLinesText: linesToText(voice?.typicalLines),
    forbiddenLinesText: linesToText(voice?.forbiddenLines),
    honorificsText: mapToText(voice?.honorifics),
    bySituationText: listMapToText(voice?.bySituation),
    byEmotionText: listMapToText(voice?.byEmotion),
    byRelationStageText: listMapToText(voice?.byRelationStage),
    knowledgeScopeRef: String(character?.knowledgeScopeRef ?? ""),
    currentStateRef: String(character?.currentStateRef ?? ""),
    forbiddenWritesText: linesToText(character?.forbiddenWrites as string[] | undefined),
    arcRef: String(character?.arcRef ?? ""),
    relatedWorldbookText: linesToText(character?.relatedWorldbook as string[] | undefined),
  };
}

export function parseLineList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseStringMap(text: string): Record<string, string> {
  const lines = parseLineList(text);
  const entries = lines
    .map((line) => {
      const [key, ...rest] = line.split(":");
      const normalizedKey = key?.trim();
      const normalizedValue = rest.join(":").trim();
      return normalizedKey && normalizedValue ? [normalizedKey, normalizedValue] : null;
    })
    .filter((entry): entry is [string, string] => entry !== null);
  return Object.fromEntries(entries);
}

export function parseListMap(text: string): Record<string, string[]> {
  const lines = parseLineList(text);
  const entries = lines
    .map((line) => {
      const [key, ...rest] = line.split(":");
      const normalizedKey = key?.trim();
      const values = rest
        .join(":")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      return normalizedKey && values.length > 0 ? [normalizedKey, values] : null;
    })
    .filter((entry): entry is [string, string[]] => entry !== null);
  return Object.fromEntries(entries);
}

export function toCharacterPayload(draft: CharacterFormDraft): CharacterInput {
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    links: parseLineList(draft.linksText),
    voice: {
      typicalLines: parseLineList(draft.typicalLinesText),
      forbiddenLines: parseLineList(draft.forbiddenLinesText),
      honorifics: parseStringMap(draft.honorificsText),
      bySituation: parseListMap(draft.bySituationText),
      byEmotion: parseListMap(draft.byEmotionText),
      byRelationStage: parseListMap(draft.byRelationStageText),
    },
    knowledgeScopeRef: draft.knowledgeScopeRef.trim() || undefined,
    currentStateRef: draft.currentStateRef.trim() || undefined,
    forbiddenWrites: parseLineList(draft.forbiddenWritesText),
    arcRef: draft.arcRef.trim() || undefined,
    relatedWorldbook: parseLineList(draft.relatedWorldbookText),
  };
}

export function filterCharacters(characters: Character[], query: string): Character[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return characters;
  }

  return characters.filter((character) => {
    const haystacks = [
      character.id,
      character.name,
      ...(Array.isArray(character.links) ? character.links : []),
      ...(Array.isArray(character.forbiddenWrites) ? character.forbiddenWrites : []),
      ...(Array.isArray(character.relatedWorldbook) ? character.relatedWorldbook : []),
    ]
      .filter(Boolean)
      .map((item) => String(item).toLowerCase());
    return haystacks.some((item) => item.includes(normalizedQuery));
  });
}

export function getCharacterRelations(relations: Relation[], characterId: string): Relation[] {
  return relations.filter((relation) => relation.from === characterId || relation.to === characterId);
}

export function getCharacterTimelineEvents(events: TimelineEvent[], characterId: string): TimelineEvent[] {
  return events.filter((event) => Array.isArray(event.participants) && event.participants.includes(characterId));
}
