import type { Relation, TimelineEvent } from "@shulingge/shared";

import { listRelations, listTimelineEvents } from "./knowledge.js";

export interface RelationReplayFrame {
  order: number;
  chapterId: string;
  relations: Array<{
    relationId: string;
    from: string;
    to: string;
    type: string;
    stage?: string;
  }>;
  timelineEvents: Array<{
    eventId: string;
    title: string;
    participants: string[];
  }>;
}

export interface RelationReplay {
  projectId: string;
  novelId: string;
  frames: RelationReplayFrame[];
}

function relationFramesByChapter(relations: Relation[]): Map<string, RelationReplayFrame["relations"]> {
  const frames = new Map<string, RelationReplayFrame["relations"]>();
  for (const relation of relations) {
    for (const chapterId of relation.sourceChapters) {
      const current = frames.get(chapterId) ?? [];
      current.push({
        relationId: relation.id,
        from: relation.from,
        to: relation.to,
        type: relation.type,
        stage: relation.stage,
      });
      frames.set(chapterId, current);
    }
  }
  return frames;
}

function timelineFramesByChapter(events: TimelineEvent[]): Map<string, RelationReplayFrame["timelineEvents"]> {
  const frames = new Map<string, RelationReplayFrame["timelineEvents"]>();
  for (const event of events) {
    for (const chapterId of event.boundChapters) {
      const current = frames.get(chapterId) ?? [];
      current.push({
        eventId: event.id,
        title: event.title,
        participants: event.participants,
      });
      frames.set(chapterId, current);
    }
  }
  return frames;
}

export async function buildRelationReplay(
  vaultRoot: string,
  input: { projectId: string; novelId: string },
): Promise<RelationReplay> {
  const [relations, events] = await Promise.all([
    listRelations(vaultRoot, { projectId: input.projectId }),
    listTimelineEvents(vaultRoot, { projectId: input.projectId }),
  ]);

  const relationFrames = relationFramesByChapter(relations);
  const timelineFrames = timelineFramesByChapter(events);
  const chapterIds = [...new Set([...relationFrames.keys(), ...timelineFrames.keys()])].sort();

  return {
    projectId: input.projectId,
    novelId: input.novelId,
    frames: chapterIds.map((chapterId, index) => ({
      order: index + 1,
      chapterId,
      relations: relationFrames.get(chapterId) ?? [],
      timelineEvents: timelineFrames.get(chapterId) ?? [],
    })),
  };
}
