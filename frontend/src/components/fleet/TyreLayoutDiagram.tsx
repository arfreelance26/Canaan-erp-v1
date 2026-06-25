import { cn } from "@/lib/utils";
import { getTyrePositionLabel, getUnitLabel, type TruckUnit, type TyreLayout } from "@/lib/tyre-layouts";

const CENTER_X = 200;
const RAIL_LEFT_X = 155;
const RAIL_RIGHT_X = 231;
const RAIL_WIDTH = 14;
const CHASSIS_LEFT = 155;
const CHASSIS_RIGHT = 245;
const CHASSIS_WIDTH = CHASSIS_RIGHT - CHASSIS_LEFT;

const STEER_WHEEL_W = 35;
const STEER_WHEEL_H = 100;
const STEER_LEFT_X = 70;
const STEER_RIGHT_X = 295;

const DRIVE_WHEEL_W = 28;
const DRIVE_WHEEL_H = 100;
const DRIVE_LEFT_X = [40, 74];
const DRIVE_RIGHT_X = [298, 332];

const RAIL_TOP = 40;
const DRIVE_PITCH = 150;
const FIRST_DRIVE_OFFSET_HEAD = 460;
const FIRST_DRIVE_OFFSET_TRAILER = 160;
const BOTTOM_PAD = 130;
const VIEWBOX_PAD = 20;

function Wheel({
  x,
  y,
  width,
  height,
  rx,
  filled,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  filled: boolean;
}) {
  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={rx}
        className={cn(
          "transition-[fill,stroke] duration-500 ease-out",
          filled ? "fill-slate-800" : "fill-gray-200"
        )}
        stroke={filled ? "#0f172a" : "#94a3b8"}
        strokeWidth={filled ? 1 : 1.5}
        strokeDasharray={filled ? "0" : "4 3"}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={rx}
        fill="url(#tyre-tread)"
        className={cn("transition-opacity duration-500 ease-out", filled ? "opacity-60" : "opacity-0")}
      />
      <circle
        cx={cx}
        cy={cy}
        r={Math.min(width, height) * 0.18}
        className={cn(
          "transition-[fill] duration-500 ease-out",
          filled ? "fill-slate-300" : "fill-transparent"
        )}
      />
    </g>
  );
}

function TruckUnitDiagram({
  unit,
  unitLabel,
  isHead,
  filledPositions,
}: {
  unit: TruckUnit;
  unitLabel: string;
  isHead: boolean;
  filledPositions: Set<string>;
}) {
  const steerAxles = unit.axles
    .map((axle, index) => ({ axle, index }))
    .filter(({ axle }) => axle.wheelsPerSide === 1);
  const driveAxles = unit.axles
    .map((axle, index) => ({ axle, index }))
    .filter(({ axle }) => axle.wheelsPerSide === 2);

  const headSteerAxle = isHead ? steerAxles[0] : undefined;
  const extraSteerAxles = isHead ? steerAxles.slice(1) : steerAxles;

  const base = RAIL_TOP;
  const extraRowsStart = isHead ? FIRST_DRIVE_OFFSET_HEAD : FIRST_DRIVE_OFFSET_TRAILER;
  const firstDriveOffset = extraRowsStart + extraSteerAxles.length * DRIVE_PITCH;
  const numDrive = driveAxles.length;
  const lastDriveCenter = base + firstDriveOffset + DRIVE_PITCH * Math.max(numDrive - 1, 0);
  const railBottom = lastDriveCenter + 50 + BOTTOM_PAD;
  const height = railBottom + VIEWBOX_PAD;
  const railHeight = railBottom - RAIL_TOP;

  return (
    <svg viewBox={`0 0 400 ${height}`} className="h-auto w-full max-w-[160px]">
      {/* chassis rails */}
      <rect x={RAIL_LEFT_X} y={RAIL_TOP} width={RAIL_WIDTH} height={railHeight} fill="url(#chassis-fill)" stroke="#93c5fd" strokeWidth={1} />
      <rect x={RAIL_RIGHT_X} y={RAIL_TOP} width={RAIL_WIDTH} height={railHeight} fill="url(#chassis-fill)" stroke="#93c5fd" strokeWidth={1} />
      {/* front and rear cross-members */}
      <rect x={CHASSIS_LEFT} y={RAIL_TOP} width={CHASSIS_WIDTH} height={14} fill="url(#chassis-fill)" stroke="#93c5fd" strokeWidth={1} />
      <rect x={CHASSIS_LEFT} y={railBottom - 14} width={CHASSIS_WIDTH} height={14} fill="url(#chassis-fill)" stroke="#93c5fd" strokeWidth={1} />

      {/* extra steer axle rows (for layouts with more than one steer axle) */}
      {extraSteerAxles.map(({ index }, j) => {
        const centerY = base + extraRowsStart + j * DRIVE_PITCH;
        const wheelY = centerY - STEER_WHEEL_H / 2;
        const leftPos = getTyrePositionLabel(unitLabel, index, "Left", 1, 1);
        const rightPos = getTyrePositionLabel(unitLabel, index, "Right", 1, 1);
        return (
          <g key={`steer-${index}`}>
            <line x1={100} x2={300} y1={centerY} y2={centerY} stroke="#78909c" strokeWidth={12} strokeLinecap="round" />
            <circle cx={CENTER_X} cy={centerY} r={10} fill="#cbd5e1" stroke="#94a3b8" strokeWidth={1} />
            <Wheel x={STEER_LEFT_X} y={wheelY} width={STEER_WHEEL_W} height={STEER_WHEEL_H} rx={8} filled={filledPositions.has(leftPos)} />
            <Wheel x={STEER_RIGHT_X} y={wheelY} width={STEER_WHEEL_W} height={STEER_WHEEL_H} rx={8} filled={filledPositions.has(rightPos)} />
          </g>
        );
      })}

      {/* leaf springs for drive axles */}
      {driveAxles.map(({ index }, i) => {
        const centerY = base + firstDriveOffset + DRIVE_PITCH * i;
        const wheelY = centerY - DRIVE_WHEEL_H / 2;
        return (
          <g key={`leaf-${index}`} fill="#769a82" stroke="#4a6654" strokeWidth={2}>
            <rect x={CHASSIS_LEFT - 10} y={wheelY} width={10} height={DRIVE_WHEEL_H} rx={5} />
            <rect x={CHASSIS_RIGHT} y={wheelY} width={10} height={DRIVE_WHEEL_H} rx={5} />
          </g>
        );
      })}

      {isHead && headSteerAxle && (
        <g>
          {/* cab */}
          <rect x={165} y={base + 30} width={70} height={130} fill="#d32f2f" rx={4} />
          <rect x={172} y={base + 38} width={56} height={18} rx={2} fill="#cbd5e1" />
          <rect x={150} y={base + 60} width={15} height={30} fill="#d32f2f" />
          <rect x={235} y={base + 40} width={15} height={20} fill="#d32f2f" />
          {/* visor */}
          <path
            d={`M 185 ${base + 160} L 215 ${base + 160} L 210 ${base + 210} L 190 ${base + 210} Z`}
            fill="#90a4ae"
          />
        </g>
      )}

      {/* driveshaft */}
      {isHead && headSteerAxle && (
        <g>
          <line x1={CENTER_X} y1={base + 210} x2={CENTER_X} y2={lastDriveCenter} stroke="#90a4ae" strokeWidth={6} />
          <g fill="#455a64">
            <polygon points={`195,${base + 210} 205,${base + 210} 200,${base + 220}`} />
            <polygon points={`195,${base + 300} 205,${base + 300} 200,${base + 290}`} />
            <polygon points={`195,${base + 330} 205,${base + 330} 200,${base + 340}`} />
            {driveAxles.map(({ index }, i) => {
              const centerY = base + firstDriveOffset + DRIVE_PITCH * i;
              return (
                <g key={`joint-${index}`}>
                  <polygon points={`195,${centerY} 205,${centerY} 200,${centerY - 10}`} />
                  <polygon points={`195,${centerY} 205,${centerY} 200,${centerY + 10}`} />
                </g>
              );
            })}
          </g>
        </g>
      )}

      {isHead && headSteerAxle && (
        <g>
          {/* steering linkage */}
          <path
            d={`M 165 ${base + 140} L 130 ${base + 140} L 130 ${base + 180}`}
            fill="none"
            stroke="#769a82"
            strokeWidth={10}
            strokeLinejoin="round"
          />
          <rect x={115} y={base + 180} width={30} height={25} rx={5} fill="#769a82" />
          {/* spare tyre */}
          <Wheel x={235} y={base + 170} width={85} height={40} rx={15} filled={filledPositions.has("Spare")} />
        </g>
      )}

      {/* steer / front axle beam and diff */}
      {isHead && headSteerAxle && (
        <g>
          <line x1={100} x2={300} y1={base + 100} y2={base + 100} stroke="#78909c" strokeWidth={12} strokeLinecap="round" />
          <circle cx={CENTER_X} cy={base + 100} r={16} fill="#618972" stroke="#455a64" strokeWidth={2} />
        </g>
      )}

      {!isHead && (
        <g>
          {/* coupling plate */}
          <rect x={170} y={base + 10} width={60} height={16} rx={4} fill="#94a3b8" stroke="#64748b" strokeWidth={1} />
          <circle cx={CENTER_X} cy={base + 18} r={5} fill="#cbd5e1" stroke="#64748b" strokeWidth={1} />
          {/* landing gear legs */}
          <rect x={145} y={base + 34} width={10} height={30} rx={3} fill="#769a82" stroke="#4a6654" strokeWidth={2} />
          <rect x={245} y={base + 34} width={10} height={30} rx={3} fill="#769a82" stroke="#4a6654" strokeWidth={2} />
          {/* driveshaft */}
          {numDrive > 1 && (
            <g>
              <line x1={CENTER_X} y1={base + firstDriveOffset} x2={CENTER_X} y2={lastDriveCenter} stroke="#90a4ae" strokeWidth={6} />
              <g fill="#455a64">
                {driveAxles.map(({ index }, i) => {
                  const centerY = base + firstDriveOffset + DRIVE_PITCH * i;
                  return (
                    <g key={`joint-${index}`}>
                      <polygon points={`195,${centerY} 205,${centerY} 200,${centerY - 10}`} />
                      <polygon points={`195,${centerY} 205,${centerY} 200,${centerY + 10}`} />
                    </g>
                  );
                })}
              </g>
            </g>
          )}
        </g>
      )}

      {/* fuel tanks and component boxes */}
      {isHead && headSteerAxle && (
        <g>
          <g fill="#2471a3" stroke="#1a5276" strokeWidth={2}>
            <rect x={100} y={base + 230} width={45} height={60} />
            <rect x={255} y={base + 230} width={45} height={60} />
          </g>
          <g fill="#1a5276">
            <rect x={90} y={base + 250} width={10} height={20} />
            <rect x={300} y={base + 250} width={10} height={20} />
          </g>
          <g fill="#95a5a6" stroke="#7f8c8d" strokeWidth={2}>
            <rect x={90} y={base + 310} width={60} height={20} rx={10} />
            <rect x={90} y={base + 335} width={60} height={20} rx={10} />
            <rect x={250} y={base + 310} width={60} height={20} rx={10} />
            <rect x={250} y={base + 335} width={60} height={20} rx={10} />
          </g>
        </g>
      )}

      {/* drive axle rows */}
      {driveAxles.map(({ axle, index }, i) => {
        const centerY = base + firstDriveOffset + DRIVE_PITCH * i;
        const wheelY = centerY - DRIVE_WHEEL_H / 2;
        return (
          <g key={`drive-${index}`}>
            <line x1={60} x2={340} y1={centerY} y2={centerY} stroke="#78909c" strokeWidth={12} strokeLinecap="round" />
            <circle cx={CENTER_X} cy={centerY} r={20} fill="#618972" stroke="#455a64" strokeWidth={2} />
            {DRIVE_LEFT_X.slice(0, axle.wheelsPerSide).map((x, w) => {
              const position = getTyrePositionLabel(unitLabel, index, "Left", w + 1, axle.wheelsPerSide);
              return <Wheel key={`l-${w}`} x={x} y={wheelY} width={DRIVE_WHEEL_W} height={DRIVE_WHEEL_H} rx={6} filled={filledPositions.has(position)} />;
            })}
            {DRIVE_RIGHT_X.slice(0, axle.wheelsPerSide).map((x, w) => {
              const position = getTyrePositionLabel(unitLabel, index, "Right", w + 1, axle.wheelsPerSide);
              return <Wheel key={`r-${w}`} x={x} y={wheelY} width={DRIVE_WHEEL_W} height={DRIVE_WHEEL_H} rx={6} filled={filledPositions.has(position)} />;
            })}
          </g>
        );
      })}

      {/* steer axle wheels (combined with cab row) */}
      {isHead && headSteerAxle && (
        <g>
          <Wheel
            x={STEER_LEFT_X}
            y={base + 50}
            width={STEER_WHEEL_W}
            height={STEER_WHEEL_H}
            rx={8}
            filled={filledPositions.has(getTyrePositionLabel(unitLabel, headSteerAxle.index, "Left", 1, 1))}
          />
          <Wheel
            x={STEER_RIGHT_X}
            y={base + 50}
            width={STEER_WHEEL_W}
            height={STEER_WHEEL_H}
            rx={8}
            filled={filledPositions.has(getTyrePositionLabel(unitLabel, headSteerAxle.index, "Right", 1, 1))}
          />
        </g>
      )}
    </svg>
  );
}

export function TyreLayoutDiagram({
  layout,
  filledPositions = new Set<string>(),
}: {
  layout: TyreLayout;
  filledPositions?: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap items-center justify-center gap-6 rounded-lg border border-gray-200 p-4"
        style={{ backgroundColor: "#eef2f6" }}
      >
        <svg width={0} height={0} className="absolute">
          <defs>
            <linearGradient id="chassis-fill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a9cce3" stopOpacity={1} />
              <stop offset="100%" stopColor="#cfe4f3" stopOpacity={1} />
            </linearGradient>
            <pattern id="tyre-tread" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#111827" strokeWidth={2.5} />
            </pattern>
          </defs>
        </svg>
        {layout.units.map((unit, index) => {
          const unitLabel = getUnitLabel(layout, unit, index);
          const isHead = layout.units.length === 1 || unit.label?.toLowerCase().includes("head") === true;
          return (
            <div key={index} className="flex flex-col items-center gap-2">
              <TruckUnitDiagram unit={unit} unitLabel={unitLabel} isHead={isHead} filledPositions={filledPositions} />
              {unit.label && <span className="text-xs font-medium text-gray-500">{unit.label}</span>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">{layout.description}</p>
    </div>
  );
}
