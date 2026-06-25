export type Axle = {
  wheelsPerSide: 1 | 2;
};

export type TruckUnit = {
  label?: string;
  axles: Axle[];
};

export type TyreLayout = {
  id: string;
  label: string;
  description: string;
  units: TruckUnit[];
};

export const TYRE_LAYOUT_OPTIONS: TyreLayout[] = [
  {
    id: "6+1",
    label: "6+1 (6 Wheeler + Spare)",
    description: "2 tyres in front, 4 tyres in rear (2 per side), plus 1 spare",
    units: [{ axles: [{ wheelsPerSide: 1 }, { wheelsPerSide: 2 }] }],
  },
  {
    id: "10+1",
    label: "10+1 (10 Wheeler + Spare)",
    description: "2 tyres in front, 8 tyres in rear (4 per side across 2 axles), plus 1 spare",
    units: [{ axles: [{ wheelsPerSide: 1 }, { wheelsPerSide: 2 }, { wheelsPerSide: 2 }] }],
  },
  {
    id: "12+1",
    label: "12+1 (12 Wheeler + Spare)",
    description:
      "4 tyres in front (2 per axle across 2 axles), 8 tyres in rear (4 per side across 2 axles), plus 1 spare",
    units: [
      {
        axles: [
          { wheelsPerSide: 1 },
          { wheelsPerSide: 1 },
          { wheelsPerSide: 2 },
          { wheelsPerSide: 2 },
        ],
      },
    ],
  },
  {
    id: "14+1",
    label: "14+1 (14 Wheeler + Spare)",
    description:
      "6 tyres in front (2 per axle across 3 axles), 8 tyres in rear (4 per side across 2 axles), plus 1 spare",
    units: [
      {
        axles: [
          { wheelsPerSide: 1 },
          { wheelsPerSide: 1 },
          { wheelsPerSide: 1 },
          { wheelsPerSide: 2 },
          { wheelsPerSide: 2 },
        ],
      },
    ],
  },
  {
    id: "14+1-tractor-trailer",
    label: "14+1 Tractor Head + Trailer",
    description:
      "Tractor Head (6 wheeler): 2 front + 4 rear (2 per side). Trailer: 8 wheels (4 per side). Plus 1 spare.",
    units: [
      { label: "Tractor Head", axles: [{ wheelsPerSide: 1 }, { wheelsPerSide: 2 }] },
      { label: "Trailer", axles: [{ wheelsPerSide: 2 }, { wheelsPerSide: 2 }] },
    ],
  },
  {
    id: "18+1-tractor-trailer",
    label: "18+1 Tractor Head + Trailer",
    description:
      "Tractor Head (6 wheeler): 2 front + 4 rear (2 per side). Trailer: 12 wheels (6 per side). Plus 1 spare.",
    units: [
      { label: "Tractor Head", axles: [{ wheelsPerSide: 1 }, { wheelsPerSide: 2 }] },
      {
        label: "Trailer",
        axles: [{ wheelsPerSide: 2 }, { wheelsPerSide: 2 }, { wheelsPerSide: 2 }],
      },
    ],
  },
  {
    id: "22+1-tractor-trailer",
    label: "22+1 Tractor Head + Trailer",
    description:
      "Tractor Head (10 wheeler): 2 front + 8 rear (4 per side across 2 axles). Trailer: 12 wheels (6 per side). Plus 1 spare.",
    units: [
      {
        label: "Tractor Head",
        axles: [{ wheelsPerSide: 1 }, { wheelsPerSide: 2 }, { wheelsPerSide: 2 }],
      },
      {
        label: "Trailer",
        axles: [{ wheelsPerSide: 2 }, { wheelsPerSide: 2 }, { wheelsPerSide: 2 }],
      },
    ],
  },
];

export function getTyreLayout(id: string): TyreLayout | undefined {
  return TYRE_LAYOUT_OPTIONS.find((layout) => layout.id === id);
}

export function getUnitLabel(layout: TyreLayout, unit: TruckUnit, unitIndex: number): string {
  return unit.label ?? (layout.units.length > 1 ? `Unit ${unitIndex + 1}` : "");
}

export function getTyrePositionLabel(
  unitLabel: string,
  axleIndex: number,
  side: "Left" | "Right",
  wheel: number,
  wheelsPerSide: number
): string {
  const wheelSuffix = wheelsPerSide > 1 ? ` ${wheel}` : "";
  return `${unitLabel ? `${unitLabel} - ` : ""}Axle ${axleIndex + 1} - ${side}${wheelSuffix}`;
}

export function getTyrePositions(layout: TyreLayout): string[] {
  const positions: string[] = [];

  layout.units.forEach((unit, unitIndex) => {
    const unitLabel = getUnitLabel(layout, unit, unitIndex);

    unit.axles.forEach((axle, axleIndex) => {
      for (const side of ["Left", "Right"] as const) {
        for (let wheel = 1; wheel <= axle.wheelsPerSide; wheel++) {
          positions.push(getTyrePositionLabel(unitLabel, axleIndex, side, wheel, axle.wheelsPerSide));
        }
      }
    });
  });

  positions.push("Spare");

  return positions;
}
