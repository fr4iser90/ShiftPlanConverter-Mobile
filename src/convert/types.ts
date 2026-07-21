export type ShiftEntry = {
  type: string;
  date: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  isSpecial?: boolean;
  isWork?: boolean;
  isValidated?: boolean;
  pause?: string;
  pepSoll?: string;
  vertrSoll?: string;
  ist?: string;
  azkDaily?: string;
  azkKum?: string;
  bereitPercent?: string;
  bewertet?: string;
};

export type MonthSummary = {
  month: string | null;
  year: string | null;
  uebertragVormonat: string | null;
  uebertragFolgemonat: string | null;
  periodePepSoll: string | null;
  periodeVertrSoll: string | null;
  periodeIst: string | null;
  periodeSaldo: string | null;
  bereitschaftAuszahlung: string | null;
  bereitschaftAzk: string | null;
};

export type ParseResult = {
  year: string;
  month: string;
  mainEntries: ShiftEntry[];
  bereitschaftEntries: ShiftEntry[];
  summary: MonthSummary | null;
  summaries: MonthSummary[];
};

export type ConvertResult = {
  entries: ShiftEntry[];
  year: string | null;
  month: string | null;
  summary: MonthSummary | null;
  summaries: MonthSummary[];
};

export type MappingValue =
  | string
  | {
      code: string;
      label?: string;
      type?: string;
      isValidated?: boolean;
    };

export type HospitalMapping = {
  colors?: Record<string, string>;
  presets?: Record<string, Record<string, MappingValue>>;
};
