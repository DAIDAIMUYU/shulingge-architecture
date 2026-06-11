import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Image, LayoutGrid, List, Plus, Save, Search, Sparkles, Trash2, UserRound, X } from "lucide-react";

import {
  api,
  ApiError,
  type AssistCharacterField,
  type Character,
  type CharacterInput,
  type CharacterProfile,
  type CharacterProfileGroup,
  type CharacterProfileTemplate,
  type ProjectSummary,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { CenterState, ViewShell } from "./common.js";
import { ProjectSelector } from "./ProjectSelector.js";

type CharacterViewMode = "card" | "list";
type EditorMode = "create" | "edit";
type AssistMode = "original" | "fanfic";

interface CharacterField {
  key: string;
  label: string;
}

interface CharacterSubsection {
  title?: string;
  fields: CharacterField[];
}

interface CharacterGroupDefinition {
  id: CharacterProfileGroup;
  title: string;
  simpleTitle?: string;
  subsections: CharacterSubsection[];
}

interface CharacterAssistField extends AssistCharacterField {
  custom?: boolean;
}

const DEFAULT_PROJECT_ID = "demo-series";
const PROFILE_GROUPS: CharacterProfileGroup[] = ["basic", "appearance", "language", "belief", "relations", "background"];

const GROUP_DEFINITIONS: CharacterGroupDefinition[] = [
  {
    id: "basic",
    title: "基础资料",
    simpleTitle: "基础",
    subsections: [
      {
        fields: [
          { key: "fullName", label: "角色全名" },
          { key: "nickname", label: "昵称/外号" },
          { key: "age", label: "年龄" },
          { key: "birthday", label: "生日" },
          { key: "birthTime", label: "出生时间" },
          { key: "birthPlace", label: "出生地" },
          { key: "genderPronouns", label: "性别/代词" },
          { key: "sexualOrientation", label: "性取向/亲密关系倾向" },
          { key: "relationshipStatus", label: "当前关系状态" },
          { key: "species", label: "种族/物种" },
          { key: "culture", label: "民族/文化身份" },
          { key: "bloodType", label: "血型" },
          { key: "likes", label: "喜欢的东西" },
          { key: "dislikes", label: "讨厌的东西" },
          { key: "appearanceImpression", label: "整体外貌印象" },
          { key: "personalityImpression", label: "整体性格印象" },
          { key: "hobbies", label: "兴趣爱好" },
          { key: "occupation", label: "职业/身份" },
          { key: "strengths", label: "擅长的事" },
          { key: "weaknesses", label: "不擅长的事" },
          { key: "oneLine", label: "一句话介绍" },
        ],
      },
    ],
  },
  {
    id: "appearance",
    title: "外貌与身体",
    simpleTitle: "外貌",
    subsections: [
      {
        title: "脸部",
        fields: [
          { key: "currentState", label: "当前状态" },
          { key: "height", label: "身高" },
          { key: "weight", label: "体重" },
          { key: "hairColor", label: "发色" },
          { key: "hairstyle", label: "发型" },
          { key: "facialHair", label: "胡须/面部毛发" },
          { key: "eyelashes", label: "睫毛" },
          { key: "eyebrows", label: "眉毛" },
          { key: "faceShape", label: "脸型" },
          { key: "ears", label: "耳朵特征" },
          { key: "cheekbones", label: "颧骨" },
          { key: "jawline", label: "下颌线" },
          { key: "chin", label: "下巴" },
          { key: "neck", label: "脖颈" },
          { key: "skinMarks", label: "皮肤印记" },
          { key: "scars", label: "伤疤" },
          { key: "distinctiveFeatures", label: "独特外貌特征" },
          { key: "skinTone", label: "肤色/肤质" },
          { key: "eyeColor", label: "眼睛颜色" },
          { key: "facialFeatures", label: "五官特点" },
          { key: "freckles", label: "雀斑" },
          { key: "moles", label: "痣" },
          { key: "firstImpression", label: "第一眼感觉" },
          { key: "obviousFeature", label: "最明显外貌特征" },
        ],
      },
      {
        title: "身体、声音与健康",
        fields: [
          { key: "bodyType", label: "体型" },
          { key: "dominantHand", label: "惯用手" },
          { key: "fingerFeatures", label: "手指特征" },
          { key: "handFeatures", label: "手部特征" },
          { key: "waistHipRatio", label: "腰部/胯部比例" },
          { key: "veins", label: "血管明显程度" },
          { key: "flexibility", label: "柔韧性" },
          { key: "bodyTemperature", label: "体温" },
          { key: "posture", label: "站姿/坐姿/走路姿态" },
          { key: "birthmark", label: "胎记" },
          { key: "tattoo", label: "纹身" },
          { key: "piercing", label: "穿孔/耳洞/饰钉" },
          { key: "teeth", label: "牙齿状态" },
          { key: "voice", label: "声音特点" },
          { key: "clothingStyle", label: "穿衣风格" },
          { key: "health", label: "健康状况" },
          { key: "allergies", label: "过敏源" },
          { key: "shoeSize", label: "鞋码" },
        ],
      },
    ],
  },
  {
    id: "language",
    title: "语言习惯与个性",
    simpleTitle: "性格",
    subsections: [
      {
        fields: [
          { key: "languages", label: "会说的语言" },
          { key: "accent", label: "口音" },
          { key: "personalityType", label: "性格类型" },
          { key: "corePersonality", label: "核心性格" },
          { key: "bestQuality", label: "最大优点" },
          { key: "worstFlaw", label: "最大缺点" },
          { key: "culturalBackground", label: "文化背景" },
          { key: "residence", label: "居住地" },
          { key: "speechStyle", label: "说话方式" },
          { key: "catchphrases", label: "常用词/口头禅" },
          { key: "titles", label: "头衔/称号" },
          { key: "zodiac", label: "星座" },
          { key: "fears", label: "害怕的事" },
          { key: "phobias", label: "恐惧症" },
          { key: "goodHabits", label: "好习惯" },
          { key: "badHabits", label: "坏习惯" },
          { key: "gestures", label: "小动作" },
          { key: "intelligence", label: "智力水平" },
          { key: "education", label: "教育经历" },
          { key: "interests", label: "兴趣领域" },
          { key: "humor", label: "幽默感" },
          { key: "problemSolving", label: "解决问题的方式" },
          { key: "empathy", label: "情绪感知能力" },
          { key: "creativity", label: "创造力" },
          { key: "addictions", label: "成瘾或依赖" },
          { key: "introversion", label: "内向还是外向" },
          { key: "petPeeve", label: "最受不了的小事" },
          { key: "commonMood", label: "常见情绪状态" },
          { key: "greeting", label: "握手/打招呼方式" },
          { key: "luckyNumber", label: "幸运数字" },
          { key: "treasuredItem", label: "最珍惜的物品" },
          { key: "diet", label: "饮食偏好" },
          { key: "scent", label: "标志性气味" },
          { key: "emergencyContact", label: "第一紧急联系人" },
          { key: "bucketList", label: "人生愿望清单" },
          { key: "morningRoutine", label: "早晨习惯" },
          { key: "sports", label: "运动能力/喜欢的运动" },
          { key: "uniqueSkills", label: "独特技能" },
          { key: "sleep", label: "睡眠习惯" },
        ],
      },
    ],
  },
  {
    id: "belief",
    title: "信念价值观与动机",
    simpleTitle: "动机",
    subsections: [
      {
        title: "信念价值观",
        fields: [
          { key: "politics", label: "政治倾向/立场" },
          { key: "religion", label: "宗教或精神信仰" },
          { key: "coreValues", label: "核心价值观" },
          { key: "morality", label: "对善恶与道德的看法" },
          { key: "happiness", label: "对幸福的理解" },
          { key: "success", label: "对成功的定义" },
          { key: "worldview", label: "对世界和社会的看法" },
          { key: "socialIssues", label: "对重要社会议题的态度" },
          { key: "philosophy", label: "人生哲学" },
          { key: "selfImage", label: "如何看待自己" },
          { key: "optimism", label: "偏乐观还是偏悲观" },
        ],
      },
      {
        title: "动机冲突欲望",
        fields: [
          { key: "coreMotivation", label: "最核心的行动动机" },
          { key: "motto", label: "人生信条" },
          { key: "darkestSecret", label: "最黑暗的秘密" },
          { key: "biggestDream", label: "最大的梦想" },
          { key: "currentGoal", label: "当前目标" },
          { key: "deepFear", label: "最深层的恐惧" },
          { key: "innerConflict", label: "内在冲突" },
          { key: "externalConflict", label: "外部冲突" },
          { key: "regret", label: "最后悔的事" },
          { key: "strongestDesire", label: "最强烈的欲望" },
          { key: "externalPressure", label: "正在承受的外部压力" },
          { key: "insecurity", label: "最大的不安全感" },
          { key: "pureJoy", label: "最纯粹的快乐来源" },
          { key: "nightmare", label: "最可怕的噩梦" },
          { key: "legacy", label: "希望留下怎样的遗产/影响" },
          { key: "whatTheyWant", label: "最想要什么" },
          { key: "whatTheyFear", label: "最害怕什么" },
        ],
      },
    ],
  },
  {
    id: "relations",
    title: "人际关系与职业",
    simpleTitle: "关系",
    subsections: [
      {
        title: "人际关系",
        fields: [
          { key: "friends", label: "朋友" },
          { key: "enemies", label: "敌人" },
          { key: "rivals", label: "竞争对手" },
          { key: "lover", label: "恋人/重要伴侣" },
          { key: "family", label: "家人" },
          { key: "familyPattern", label: "家庭关系模式" },
          { key: "mostTrusted", label: "最信任的人" },
          { key: "afraidToLose", label: "最害怕失去的人" },
          { key: "approvalWanted", label: "最想得到谁的认可" },
          { key: "withFriends", label: "和朋友相处时的样子" },
          { key: "withEnemies", label: "和敌人相处时的样子" },
          { key: "intimacyWeakness", label: "亲密关系中的弱点" },
          { key: "attractedTo", label: "容易被什么样的人吸引" },
          { key: "conflictsWith", label: "容易和什么样的人冲突" },
          { key: "favoriteCreature", label: "最喜欢的神话/幻想生物" },
          { key: "favoriteJoke", label: "最喜欢的笑话" },
          { key: "mostImportantPerson", label: "最重要的人" },
          { key: "familyRelationship", label: "和家人的关系" },
          { key: "friendshipStyle", label: "和朋友相处方式" },
        ],
      },
      {
        title: "职业与社会身份",
        fields: [
          { key: "organization", label: "所属组织/公司/阵营" },
          { key: "career", label: "职业" },
          { key: "workEthic", label: "工作伦理" },
          { key: "income", label: "收入水平" },
          { key: "volunteer", label: "是否做志愿活动" },
          { key: "idealCareer", label: "理想职业" },
          { key: "careerGoal", label: "职业目标" },
          { key: "reputation", label: "职业名声" },
          { key: "careerChallenge", label: "职业挑战" },
          { key: "careerSkills", label: "职业技能" },
          { key: "jobFeeling", label: "对当前工作的感受" },
          { key: "coworkers", label: "对同事/伙伴的感受" },
          { key: "teamPosition", label: "在团队中的位置" },
          { key: "authority", label: "面对权威的态度" },
          { key: "failure", label: "面对失败的反应" },
          { key: "proveThemselves", label: "最想证明自己的地方" },
        ],
      },
    ],
  },
  {
    id: "background",
    title: "背景故事与同人设定",
    simpleTitle: "背景",
    subsections: [
      {
        title: "背景故事",
        fields: [
          { key: "childhood", label: "童年经历" },
          { key: "importantPastEvent", label: "过去的重要事件" },
          { key: "socialClass", label: "社会阶层" },
          { key: "criminalRecord", label: "是否有犯罪记录" },
          { key: "lifeMilestones", label: "人生重大节点" },
          { key: "achievements", label: "已经取得的成就" },
          { key: "keyMemory", label: "关键记忆" },
          { key: "childhoodInfluence", label: "童年影响" },
          { key: "lifeChoice", label: "做过的重大人生选择" },
          { key: "firstHeartbreak", label: "第一次心碎" },
          { key: "lifeLesson", label: "得到过的人生教训" },
          { key: "preciousMoment", label: "最珍贵的瞬间" },
          { key: "biggestFailure", label: "最大的失败" },
          { key: "embarrassingMoment", label: "最尴尬的时刻" },
          { key: "meaningfulObject", label: "最有意义的物品" },
          { key: "hardDecision", label: "做过最艰难的决定" },
          { key: "backgroundImpact", label: "这段背景如何影响角色现在的性格" },
          { key: "escapingPast", label: "角色是否在逃避过去" },
          { key: "pastEventEffect", label: "这件事如何影响现在" },
          { key: "finalDirection", label: "最终会走向哪里" },
        ],
      },
      {
        title: "同人/既有世界观",
        fields: [
          { key: "sourceWork", label: "角色是否属于某个已有作品" },
          { key: "sourceWorldRelation", label: "和原作世界什么关系" },
          { key: "sourceCharacterRelation", label: "和原作角色什么重要关系" },
          { key: "specialPower", label: "是否拥有该世界观特殊能力" },
          { key: "changedCanon", label: "是否改变过原作历史/世界线" },
          { key: "worldAchievement", label: "在这个世界有什么成就" },
          { key: "canonRole", label: "职责/身份/阵营" },
          { key: "canonConflict", label: "和原作设定冲突的地方" },
          { key: "storyChange", label: "存在会让原作故事发生什么变化" },
        ],
      },
    ],
  },
];

const SIMPLE_FIELDS: Partial<Record<CharacterProfileGroup, string[]>> = {
  basic: ["fullName", "age", "genderPronouns", "species", "occupation", "oneLine"],
  appearance: ["firstImpression", "obviousFeature", "hairColor", "eyeColor", "height", "clothingStyle"],
  language: ["corePersonality", "bestQuality", "worstFlaw", "speechStyle", "likes", "dislikes"],
  belief: ["whatTheyWant", "whatTheyFear", "currentGoal", "innerConflict", "externalConflict", "regret"],
  relations: ["mostImportantPerson", "familyRelationship", "friendshipStyle"],
  background: ["importantPastEvent", "pastEventEffect", "finalDirection"],
};

function readStoredProjectId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_PROJECT_ID;
  }

  return window.localStorage.getItem("shulingge.web.projectId") ?? DEFAULT_PROJECT_ID;
}

function writeStoredProjectId(projectId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("shulingge.web.projectId", projectId);
}

function createEmptyProfile(template: CharacterProfileTemplate): CharacterProfile {
  return {
    template,
    avatarPath: "",
    basic: {},
    appearance: {},
    language: {},
    belief: {},
    relations: {},
    background: {},
    custom: Object.fromEntries(PROFILE_GROUPS.map((group) => [group, []])) as CharacterProfile["custom"],
  };
}

function normalizeProfile(profile?: CharacterProfile, template: CharacterProfileTemplate = "simple"): CharacterProfile {
  const base = createEmptyProfile(profile?.template ?? template);
  return {
    ...base,
    ...profile,
    basic: { ...base.basic, ...profile?.basic },
    appearance: { ...base.appearance, ...profile?.appearance },
    language: { ...base.language, ...profile?.language },
    belief: { ...base.belief, ...profile?.belief },
    relations: { ...base.relations, ...profile?.relations },
    background: { ...base.background, ...profile?.background },
    custom: {
      ...base.custom,
      ...profile?.custom,
    },
  };
}

function collectAssistFields(profile: CharacterProfile): CharacterAssistField[] {
  const detailed = profile.template === "detailed";
  const fields: CharacterAssistField[] = [];

  for (const group of GROUP_DEFINITIONS) {
    const allowed = detailed ? null : new Set(SIMPLE_FIELDS[group.id] ?? []);
    for (const subsection of group.subsections) {
      for (const field of subsection.fields) {
        if (!allowed || allowed.has(field.key)) {
          fields.push({
            group: group.simpleTitle ?? group.title,
            key: field.key,
            label: field.label,
          });
        }
      }
    }

    for (const row of profile.custom?.[group.id] ?? []) {
      const label = row.label?.trim();
      if (label) {
        fields.push({
          group: group.simpleTitle ?? group.title,
          key: label,
          label,
          custom: true,
        });
      }
    }
  }

  return fields;
}

function collectExistingValues(profile: CharacterProfile, fields: CharacterAssistField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (field.custom) {
      const rows = profile.custom?.[GROUP_DEFINITIONS.find((group) => (group.simpleTitle ?? group.title) === field.group)?.id ?? "basic"] ?? [];
      const row = rows.find((item) => item.label?.trim() === field.label);
      values[field.key] = row?.value?.trim() ?? "";
      continue;
    }

    const groupId = GROUP_DEFINITIONS.find((group) =>
      group.subsections.some((section) => section.fields.some((item) => item.key === field.key)),
    )?.id;
    values[field.key] = groupId ? profile[groupId]?.[field.key]?.trim() ?? "" : "";
  }
  return values;
}

function mergeAssistFields(profile: CharacterProfile, fields: CharacterAssistField[], generated: Record<string, string>): CharacterProfile {
  let next = normalizeProfile(profile);

  for (const field of fields) {
    const generatedValue = (generated[field.key] ?? generated[field.label])?.trim();
    if (!generatedValue) {
      continue;
    }

    const groupDefinition = GROUP_DEFINITIONS.find((group) => (group.simpleTitle ?? group.title) === field.group);
    if (!groupDefinition) {
      continue;
    }

    if (field.custom) {
      const rows = [...(next.custom?.[groupDefinition.id] ?? [])];
      const rowIndex = rows.findIndex((row) => row.label?.trim() === field.label);
      if (rowIndex >= 0 && !rows[rowIndex].value?.trim()) {
        rows[rowIndex] = { ...rows[rowIndex], value: generatedValue };
        next = { ...next, custom: { ...next.custom, [groupDefinition.id]: rows } };
      }
      continue;
    }

    const currentValue = next[groupDefinition.id]?.[field.key]?.trim();
    if (!currentValue) {
      next = {
        ...next,
        [groupDefinition.id]: {
          ...(next[groupDefinition.id] ?? {}),
          [field.key]: generatedValue,
        },
      };
    }
  }

  return next;
}

function slugify(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `character-${Date.now().toString(36)}`;
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function characterIntro(character: Character): string {
  return firstNonEmpty(
    character.profile?.basic?.oneLine,
    character.profile?.basic?.occupation,
    character.profile?.language?.corePersonality,
    character.summary,
    "尚未填写一句话介绍",
  );
}

function isLikelyImagePath(value?: string): value is string {
  return Boolean(value && /^(https?:|data:image\/|\/)/i.test(value.trim()));
}

function profileSearchText(character: Character): string {
  return JSON.stringify(character.profile ?? {}).toLowerCase();
}

function TemplateChooser({
  onChoose,
  onAiGenerate,
  onCancel,
}: {
  onChoose(template: CharacterProfileTemplate): void;
  onAiGenerate(): void;
  onCancel(): void;
}) {
  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal character-template-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head compact">
          <div>
            <h2>选择角色模板</h2>
            <p>先决定这张角色卡的填写深度，之后仍可继续补充字段。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="character-template-grid">
          <button type="button" className="character-template-card" onClick={() => onChoose("simple")}>
            <UserRound size={24} />
            <strong>精简版</strong>
            <span>快速搭出角色骨架，适合主线初期或配角。</span>
          </button>
          <button type="button" className="character-template-card" onClick={() => onChoose("detailed")}>
            <Image size={24} />
            <strong>详细版</strong>
            <span>事无巨细地整理人设，适合主角、反派和核心群像。</span>
          </button>
          <button type="button" className="character-template-card character-template-card-wide" onClick={onAiGenerate}>
            <Sparkles size={24} />
            <strong>AI 生成</strong>
            <span>通过几步问答生成一个新角色草稿，再进入编辑器确认和修改。</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CharacterAssistModal({
  loading,
  error,
  onCancel,
  onSubmit,
}: {
  loading: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(mode: AssistMode, userPrompt: string): void;
}) {
  const [mode, setMode] = useState<AssistMode>("original");
  const [userPrompt, setUserPrompt] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const prompt = userPrompt.trim();
    if (!prompt || loading) {
      return;
    }
    onSubmit(mode, prompt);
  };

  return (
    <div
      className="vault-modal-backdrop"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (!loading) {
          onCancel();
        }
      }}
    >
      <form className="vault-modal character-assist-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head compact">
          <div>
            <h2>AI 辅助填充</h2>
            <p>AI 会读取当前模板字段和你添加的自定义字段，只把生成内容填进空字段，保存前仍可修改。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} disabled={loading} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="character-assist-mode">
          <button type="button" className={mode === "original" ? "active" : ""} onClick={() => setMode("original")} disabled={loading}>
            原创
          </button>
          <button type="button" className={mode === "fanfic" ? "active" : ""} onClick={() => setMode("fanfic")} disabled={loading}>
            同人
          </button>
        </div>

        <label className="form-block">
          <span>{mode === "fanfic" ? "角色名 + 来源作品" : "想要一个什么样的角色"}</span>
          <textarea
            className="textarea character-assist-prompt"
            value={userPrompt}
            placeholder={mode === "fanfic" ? "例如：蝴蝶香奈惠，鬼灭之刃" : "例如：温柔但危险的药师，背负家族旧债，擅长用谎言保护别人"}
            onChange={(event) => setUserPrompt(event.target.value)}
            disabled={loading}
          />
        </label>

        {mode === "fanfic" ? (
          <div className="character-assist-note">同人资料由 AI 依据其训练知识生成，可能不准确；不确定的字段会尽量留空，请自行核对。</div>
        ) : null}
        {error ? <div className="err-card">{error}</div> : null}

        <div className="vault-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading || !userPrompt.trim()}>
            <Sparkles size={15} />
            {loading ? "生成中..." : "开始填充"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CharacterAiCreateModal({
  projectId,
  loading,
  error,
  onCancel,
  onGenerate,
}: {
  projectId: string;
  loading: boolean;
  error: string | null;
  onCancel(): void;
  onGenerate(input: { mode: AssistMode; template: CharacterProfileTemplate; userPrompt: string; extraAnswer: string }): void;
}) {
  const [mode, setMode] = useState<AssistMode | null>(null);
  const [userPrompt, setUserPrompt] = useState("");
  const [template, setTemplate] = useState<CharacterProfileTemplate>("simple");
  const [extraAnswer, setExtraAnswer] = useState("");

  const canGenerate = Boolean(mode && userPrompt.trim() && (mode === "fanfic" || extraAnswer.trim()));
  const step = !mode ? 1 : !userPrompt.trim() ? 2 : mode === "original" && !extraAnswer.trim() ? 3 : 4;

  return (
    <div className="vault-modal-backdrop" onMouseDown={loading ? undefined : onCancel}>
      <div className="vault-modal character-ai-create-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head compact">
          <div>
            <h2>AI 生成新角色</h2>
            <p>回答几个问题后，AI 会生成一份角色草稿并打开编辑器，保存前可继续修改。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} disabled={loading} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="character-ai-chat">
          <div className="character-ai-message ai">先告诉我，这是原创角色还是同人角色？</div>
          <div className="character-assist-mode">
            <button type="button" className={mode === "original" ? "active" : ""} onClick={() => setMode("original")} disabled={loading}>
              原创角色
            </button>
            <button type="button" className={mode === "fanfic" ? "active" : ""} onClick={() => setMode("fanfic")} disabled={loading}>
              同人角色
            </button>
          </div>

          {mode ? (
            <>
              <div className="character-ai-message ai">
                {mode === "fanfic" ? "写下角色名和来源作品。" : "用一句话描述你想要的角色方向。"}
              </div>
              <textarea
                className="textarea character-assist-prompt"
                value={userPrompt}
                placeholder={mode === "fanfic" ? "例如：蝴蝶香奈惠，鬼灭之刃" : "例如：外表温和的流亡医师，真实身份是前朝密探"}
                onChange={(event) => setUserPrompt(event.target.value)}
                disabled={loading}
              />
            </>
          ) : null}

          {userPrompt.trim() ? (
            <>
              <div className="character-ai-message ai">这张角色卡需要精简版还是详细版？</div>
              <div className="character-assist-mode">
                <button type="button" className={template === "simple" ? "active" : ""} onClick={() => setTemplate("simple")} disabled={loading}>
                  精简版
                </button>
                <button type="button" className={template === "detailed" ? "active" : ""} onClick={() => setTemplate("detailed")} disabled={loading}>
                  详细版
                </button>
              </div>
            </>
          ) : null}

          {mode === "original" && userPrompt.trim() ? (
            <>
              <div className="character-ai-message ai">再补一句关键设定：这个角色最核心的矛盾、目标或秘密是什么？</div>
              <textarea
                className="textarea character-ai-extra"
                value={extraAnswer}
                placeholder="例如：他想救所有人，却必须靠制造死亡维持自己的身份。"
                onChange={(event) => setExtraAnswer(event.target.value)}
                disabled={loading}
              />
            </>
          ) : null}

          {mode === "fanfic" && userPrompt.trim() ? (
            <div className="character-assist-note">同人资料由 AI 依据其训练知识生成，可能不准确；不确定字段会尽量留空，请自行核对。</div>
          ) : null}
        </div>

        {error ? <div className="err-card">{error}</div> : null}
        <div className="vault-modal-actions">
          <span className="faint">步骤 {step} / 4</span>
          <span className="grow" />
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || !canGenerate || !projectId}
            onClick={() => {
              if (mode) {
                onGenerate({ mode, template, userPrompt: userPrompt.trim(), extraAnswer: extraAnswer.trim() });
              }
            }}
          >
            <Sparkles size={15} />
            {loading ? "生成中..." : "生成角色草稿"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvatarView({ character, large = false }: { character: Character; large?: boolean }) {
  const avatarPath = character.profile?.avatarPath?.trim();
  return (
    <span className={`avatar ${large ? "lg character-avatar-large" : ""}`}>
      {isLikelyImagePath(avatarPath) ? <img src={avatarPath} alt="" /> : character.name?.slice(0, 1) || "角"}
    </span>
  );
}

function CharacterEditor({
  projectId,
  mode,
  value,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  projectId: string;
  mode: EditorMode;
  value: CharacterInput;
  saving: boolean;
  error: string | null;
  onChange(next: CharacterInput): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const profile = normalizeProfile(value.profile);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistNotice, setAssistNotice] = useState<string | null>(null);
  const isDetailed = profile.template === "detailed";

  const updateProfile = (nextProfile: CharacterProfile) => {
    onChange({ ...value, profile: nextProfile });
  };
  const updateField = (group: CharacterProfileGroup, key: string, fieldValue: string) => {
    updateProfile({
      ...profile,
      [group]: {
        ...(profile[group] ?? {}),
        [key]: fieldValue,
      },
    });
  };
  const customRows = (group: CharacterProfileGroup) => profile.custom?.[group] ?? [];
  const updateCustom = (group: CharacterProfileGroup, index: number, patch: { label?: string; value?: string }) => {
    const rows = [...customRows(group)];
    rows[index] = { ...rows[index], ...patch };
    updateProfile({ ...profile, custom: { ...profile.custom, [group]: rows } });
  };
  const addCustom = (group: CharacterProfileGroup) => {
    updateProfile({
      ...profile,
      custom: {
        ...profile.custom,
        [group]: [...customRows(group), { label: "", value: "" }],
      },
    });
  };
  const removeCustom = (group: CharacterProfileGroup, index: number) => {
    updateProfile({
      ...profile,
      custom: {
        ...profile.custom,
        [group]: customRows(group).filter((_, rowIndex) => rowIndex !== index),
      },
    });
  };
  const renderFields = (group: CharacterGroupDefinition, compact: boolean) => {
    const allowed = compact ? new Set(SIMPLE_FIELDS[group.id] ?? []) : null;
    return (
      <div className="character-field-stack">
        {group.subsections.map((subsection, sectionIndex) => {
          const fields = allowed ? subsection.fields.filter((field) => allowed.has(field.key)) : subsection.fields;
          if (!fields.length) {
            return null;
          }
          return (
            <div className="character-subsection" key={`${group.id}-${sectionIndex}`}>
              {subsection.title && !compact ? <h4>{subsection.title}</h4> : null}
              <div className="character-field-grid">
                {fields.map((field) => (
                  <label className="form-block" key={`${group.id}-${field.key}`}>
                    <span>{field.label}</span>
                    <input
                      className="input"
                      value={profile[group.id]?.[field.key] ?? ""}
                      onChange={(event) => updateField(group.id, field.key, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        <div className="character-custom-fields">
          {customRows(group.id).map((row, index) => (
            <div className="character-custom-row" key={`${group.id}-custom-${index}`}>
              <input
                className="input"
                value={row.label ?? ""}
                placeholder="自定义标题"
                onChange={(event) => updateCustom(group.id, index, { label: event.target.value })}
              />
              <input
                className="input"
                value={row.value ?? ""}
                placeholder="内容"
                onChange={(event) => updateCustom(group.id, index, { value: event.target.value })}
              />
              <button type="button" className="btn-icon danger" onClick={() => removeCustom(group.id, index)} aria-label="删除自定义字段">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost character-add-custom" onClick={() => addCustom(group.id)}>
            <Plus size={14} />
            添加自定义字段
          </button>
        </div>
      </div>
    );
  };
  const runAssist = async (assistMode: AssistMode, userPrompt: string) => {
    const fields = collectAssistFields(profile);
    if (!fields.length) {
      setAssistError("当前没有可填充的字段。");
      return;
    }

    setAssistLoading(true);
    setAssistError(null);
    setAssistNotice(null);
    try {
      const response = await api.assistCharacter({
        mode: assistMode,
        userPrompt,
        template: profile.template,
        projectId,
        fields: fields.map(({ group, key, label }) => ({ group, key, label })),
        existingValues: collectExistingValues(profile, fields),
      });
      const nextProfile = mergeAssistFields(profile, fields, response.fields);
      onChange({ ...value, profile: nextProfile });
      setAssistOpen(false);
      setAssistNotice(
        assistMode === "fanfic"
          ? "AI 已填入空字段。同人资料可能不准确，请核对后再保存。"
          : "AI 已填入空字段，请检查后再保存角色。",
      );
    } catch (assistErrorValue) {
      setAssistError(assistErrorValue instanceof ApiError ? assistErrorValue.message : "AI 辅助填充失败");
    } finally {
      setAssistLoading(false);
    }
  };

  return (
    <div className="vault-modal-backdrop character-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal character-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head">
          <div>
            <h2>{mode === "create" ? "新建角色" : `编辑角色 · ${value.name}`}</h2>
            <p>{isDetailed ? "详细版模板，默认折叠 6 大类。" : "精简版模板，优先填写最关键的人设骨架。"}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="character-modal-body">
          {error ? <div className="err-card">保存失败：{error}</div> : null}
          {assistNotice ? <div className="character-assist-success">{assistNotice}</div> : null}
          <section className="character-editor-top">
            <div className="character-avatar-uploader">
              {isLikelyImagePath(profile.avatarPath) ? <img src={profile.avatarPath} alt="" /> : <Image size={28} />}
            </div>
            <div className="character-top-fields">
              <label className="form-block">
                <span>角色名</span>
                <input className="input" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
              </label>
              <label className="form-block">
                <span>头像/立绘 URL 或本地路径</span>
                <input
                  className="input"
                  value={profile.avatarPath ?? ""}
                  placeholder="https://... 或 /assets/character.png"
                  onChange={(event) => updateProfile({ ...profile, avatarPath: event.target.value })}
                />
              </label>
            </div>
          </section>

          {isDetailed ? (
            <div className="character-accordion">
              {GROUP_DEFINITIONS.map((group) => {
                const open = Boolean(expanded[group.id]);
                return (
                  <section className="character-accordion-item" key={group.id}>
                    <button
                      type="button"
                      className="character-accordion-head"
                      onClick={() => setExpanded((current) => ({ ...current, [group.id]: !open }))}
                    >
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span>{group.title}</span>
                    </button>
                    {open ? <div className="character-accordion-body">{renderFields(group, false)}</div> : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="character-simple-grid">
              {GROUP_DEFINITIONS.map((group) => (
                <section className="info-card character-simple-section" key={group.id}>
                  <h3>{group.simpleTitle ?? group.title}</h3>
                  {renderFields(group, true)}
                </section>
              ))}
            </div>
          )}
        </div>
        <div className="agent-modal-actions view-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setAssistOpen(true);
              setAssistError(null);
            }}
          >
            <Sparkles size={15} />
            AI 辅助填充
          </button>
          <span className="grow" />
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={saving || !value.name.trim()}>
            <Save size={15} />
            {saving ? "保存中…" : "保存角色"}
          </button>
        </div>
      </div>
      {assistOpen ? (
        <CharacterAssistModal
          loading={assistLoading}
          error={assistError}
          onCancel={() => {
            if (!assistLoading) {
              setAssistOpen(false);
              setAssistError(null);
            }
          }}
          onSubmit={(nextMode, userPrompt) => {
            void runAssist(nextMode, userPrompt);
          }}
        />
      ) : null}
    </div>
  );
}

export function CharactersView() {
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<CharacterViewMode>("card");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [templateChoosing, setTemplateChoosing] = useState(false);
  const [aiCreating, setAiCreating] = useState(false);
  const [aiCreateLoading, setAiCreateLoading] = useState(false);
  const [aiCreateError, setAiCreateError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [draft, setDraft] = useState<CharacterInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadData = async (targetProjectId = projectId) => {
    setLoading(true);
    setError(null);
    setVaultMissing(false);
    try {
      const health = await api.health();
      if (!health.vaultSelected) {
        setVaultMissing(true);
        setProjects([]);
        setCharacters([]);
        setLoading(false);
        return;
      }
      const nextProjects = await api.listProjects();
      const resolvedProjectId = nextProjects.some((project) => project.projectId === targetProjectId)
        ? targetProjectId
        : nextProjects[0]?.projectId ?? targetProjectId;
      if (resolvedProjectId !== projectId) {
        setProjectId(resolvedProjectId);
        writeStoredProjectId(resolvedProjectId);
      }
      const nextCharacters = resolvedProjectId ? await api.listCharactersByProject(resolvedProjectId) : [];
      setProjects(nextProjects);
      setCharacters(nextCharacters);
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "加载角色失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filteredCharacters = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return characters;
    }
    return characters.filter((character) =>
      [
        character.id,
        character.name,
        characterIntro(character),
        ...(character.links ?? []),
        profileSearchText(character),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [characters, search]);

  const startCreate = (template: CharacterProfileTemplate) => {
    setTemplateChoosing(false);
    setFeedback(null);
    setDraft({
      id: "",
      name: "",
      links: [],
      voice: { typicalLines: [], forbiddenLines: [], honorifics: {} },
      forbiddenWrites: [],
      relatedWorldbook: [],
      profile: createEmptyProfile(template),
    });
    setSaveError(null);
    setEditorMode("create");
  };

  const generateCharacterDraft = async (input: { mode: AssistMode; template: CharacterProfileTemplate; userPrompt: string; extraAnswer: string }) => {
    const profile = createEmptyProfile(input.template);
    const fields = collectAssistFields(profile);
    const prompt = [
      input.userPrompt,
      input.mode === "original" && input.extraAnswer ? `关键补充：${input.extraAnswer}` : "",
    ].filter(Boolean).join("\n");

    setAiCreateLoading(true);
    setAiCreateError(null);
    setFeedback(null);
    try {
      const response = await api.assistCharacter({
        mode: input.mode,
        userPrompt: prompt,
        template: input.template,
        projectId,
        fields: fields.map(({ group, key, label }) => ({ group, key, label })),
        existingValues: collectExistingValues(profile, fields),
      });
      const nextProfile = mergeAssistFields(profile, fields, response.fields);
      const name = response.fields.fullName || response.fields["角色全名"] || response.fields.oneLine || input.userPrompt.split(/[，,。\n]/)[0] || "";
      setDraft({
        id: "",
        name: name.slice(0, 32),
        links: [],
        voice: { typicalLines: [], forbiddenLines: [], honorifics: {} },
        forbiddenWrites: [],
        relatedWorldbook: [],
        profile: nextProfile,
      });
      setAiCreating(false);
      setTemplateChoosing(false);
      setEditorMode("create");
      setSaveError(null);
      setFeedback({
        kind: "success",
        text: input.mode === "fanfic"
          ? "AI 已生成角色草稿。同人资料可能不准确，请核对后再保存。"
          : "AI 已生成角色草稿，请检查后再保存。",
      });
    } catch (generateError) {
      setAiCreateError(generateError instanceof ApiError ? generateError.message : "AI 生成角色失败");
    } finally {
      setAiCreateLoading(false);
    }
  };

  const startEdit = (character: Character) => {
    setFeedback(null);
    setDraft({
      id: character.id,
      name: character.name,
      links: character.links ?? [],
      voice: character.voice ?? { typicalLines: [], forbiddenLines: [], honorifics: {} },
      knowledgeScopeRef: character.knowledgeScopeRef,
      currentStateRef: character.currentStateRef,
      forbiddenWrites: character.forbiddenWrites ?? [],
      arcRef: character.arcRef,
      relatedWorldbook: character.relatedWorldbook ?? [],
      profile: normalizeProfile(character.profile, character.profile?.template ?? "simple"),
    });
    setSaveError(null);
    setEditorMode("edit");
  };

  const confirmDeleteCharacter = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await api.deleteCharacter(projectId, deleteTarget.id);
      if (draft?.id === deleteTarget.id) {
        setEditorMode(null);
        setDraft(null);
        setSaveError(null);
      }
      setDeleteTarget(null);
      setFeedback({ kind: "success", text: `已删除角色「${deleteTarget.name}」。` });
      await loadData(projectId);
    } catch (deleteError) {
      setFeedback({ kind: "error", text: deleteError instanceof ApiError ? deleteError.message : "删除角色失败" });
      setDeleteTarget(null);
    }
  };

  const persistCharacter = async () => {
    if (!draft) {
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      setSaveError("角色名不能为空");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload: CharacterInput = {
        ...draft,
        id: editorMode === "create" ? slugify(draft.id || name) : draft.id,
        name,
      };
      if (editorMode === "create") {
        await api.createCharacter(projectId, payload);
      } else {
        await api.updateCharacter(projectId, payload.id, payload);
      }
      setEditorMode(null);
      setDraft(null);
      await loadData(projectId);
    } catch (persistError) {
      setSaveError(persistError instanceof ApiError ? persistError.message : "保存角色失败");
    } finally {
      setSaving(false);
    }
  };

  const showState = loading || error !== null || vaultMissing || filteredCharacters.length === 0;

  return (
    <ViewShell
      title="角色"
      subtitle="按项目管理人物档案、头像、模板字段与自定义补充信息"
      actions={
        <>
          <ProjectSelector
            projects={projects}
            projectId={projectId}
            disabled={vaultMissing || loading}
            onChange={(nextProjectId) => {
              setProjectId(nextProjectId);
              writeStoredProjectId(nextProjectId);
            }}
          />
          <button type="button" className="btn btn-primary" onClick={() => setTemplateChoosing(true)} disabled={!projectId || vaultMissing || projects.length === 0}>
            <Plus size={15} strokeWidth={2} />
            新建角色
          </button>
        </>
      }
    >
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索角色、简介或字段…" />
        </div>
        <span className="grow" />
        <div className="view-toggle">
          <button type="button" className={`btn-icon ${viewMode === "card" ? "active" : ""}`} onClick={() => setViewMode("card")} aria-label="卡片视图">
            <LayoutGrid size={16} />
          </button>
          <button type="button" className={`btn-icon ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")} aria-label="列表视图">
            <List size={16} />
          </button>
        </div>
        <span className="faint">共 {filteredCharacters.length} / {characters.length} 位</span>
      </div>
      {feedback ? (
        <div className={`model-feedback ${feedback.kind === "success" ? "model-feedback-success" : "model-feedback-error"}`}>
          {feedback.text}
        </div>
      ) : null}

      {showState ? (
        <CenterState
          loading={loading}
          error={error}
          vaultMissing={vaultMissing}
          empty={filteredCharacters.length === 0}
          emptyText={search ? "没有匹配的角色" : "还没有角色，点右上角「新建角色」"}
        />
      ) : viewMode === "card" ? (
        <div className="character-card-grid">
          {filteredCharacters.map((character) => (
            <article className="character-card" key={character.id}>
              <button type="button" className="character-card-cover" onClick={() => startEdit(character)}>
                {isLikelyImagePath(character.profile?.avatarPath) ? (
                  <img src={character.profile?.avatarPath} alt="" />
                ) : (
                  <span>{character.name.slice(0, 1)}</span>
                )}
              </button>
              <div className="character-card-body">
                <div>
                  <h3>{character.name}</h3>
                  <p>{characterIntro(character)}</p>
                </div>
                <div className="tag-row">
                  <span className="tag primary">{character.profile?.template === "detailed" ? "详细版" : "精简版"}</span>
                  <span className="tag">{character.profile?.basic?.occupation || "未填身份"}</span>
                </div>
                <button type="button" className="btn" onClick={() => startEdit(character)}>
                  编辑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost character-delete-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteTarget(character);
                  }}
                >
                  <Trash2 size={15} />
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="list-card character-list-card">
          {filteredCharacters.map((character) => (
            <div
              role="button"
              tabIndex={0}
              className="list-row character-compact-row"
              key={character.id}
              onClick={() => startEdit(character)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  startEdit(character);
                }
              }}
            >
              <AvatarView character={character} />
              <span className="col col-grow">
                <div className="col-name">{character.name}</div>
                <div className="col-sub">{characterIntro(character)}</div>
              </span>
              <span className="tag primary">{character.profile?.template === "detailed" ? "详细" : "精简"}</span>
              <span className="col faint">{character.updatedAt ?? "未记录"}</span>
              <span
                className="character-row-actions"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <button type="button" className="btn-icon danger" onClick={() => setDeleteTarget(character)} title="删除角色">
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {templateChoosing ? (
        <TemplateChooser
          onChoose={startCreate}
          onAiGenerate={() => {
            setTemplateChoosing(false);
            setAiCreating(true);
            setAiCreateError(null);
          }}
          onCancel={() => setTemplateChoosing(false)}
        />
      ) : null}
      {aiCreating ? (
        <CharacterAiCreateModal
          projectId={projectId}
          loading={aiCreateLoading}
          error={aiCreateError}
          onCancel={() => {
            if (!aiCreateLoading) {
              setAiCreating(false);
              setAiCreateError(null);
            }
          }}
          onGenerate={(input) => {
            void generateCharacterDraft(input);
          }}
        />
      ) : null}
      {editorMode && draft ? (
        <CharacterEditor
          projectId={projectId}
          mode={editorMode}
          value={draft}
          saving={saving}
          error={saveError}
          onChange={setDraft}
          onCancel={() => {
            setEditorMode(null);
            setDraft(null);
            setSaveError(null);
          }}
          onSubmit={() => {
            void persistCharacter();
          }}
        />
      ) : null}
      {deleteTarget ? (
        <ConfirmModal
          title="删除角色"
          message={`确定删除角色「${deleteTarget.name}」吗？此操作不可恢复`}
          confirmText="删除"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteCharacter}
        />
      ) : null}
    </ViewShell>
  );
}
