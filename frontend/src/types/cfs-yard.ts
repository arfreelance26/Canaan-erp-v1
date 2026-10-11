export type CfsYardKind = "CFS" | "YARD";

export type CfsYardEntry = {
  id: string;
  kind: CfsYardKind;
  name: string;
  version: number;
};
