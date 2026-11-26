import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  Circle,
  Line,
  Text as SvgText,
  Path,
  Polygon,
  Rect,
  G,
} from "react-native-svg";
import {
  evaluateDocument,
  getPathSamples,
  type ProjectDocument,
} from "../../../packages/core/src/index.ts";
import {
  UI_PALETTE as P,
  DANCER_PALETTE,
} from "../../../packages/core/src/palette.ts";
export default function Stage({
  doc,
  beat,
  selected,
  onSelect,
  formationId,
  editing = false,
  selectedCone,
  onCone,
}: {
  doc: ProjectDocument;
  beat: number;
  selected: string;
  onSelect: (id: string) => void;
  formationId: string;
  editing?: boolean;
  selectedCone?: string;
  onCone?: (id: string) => void;
}) {
  const [size, setSize] = useState({ width: 500, height: 200 });
  const positions = evaluateDocument(doc, beat),
    w = doc.stage.width,
    d = doc.stage.depth;
  const unit = Math.max(
    1,
    Math.min(size.width / (w + 1.2), size.height / (d + 1.2)),
  );
  const marker = Math.max(0.18, 8 / unit),
    label = Math.max(0.24, 10 / unit);
  const path = doc.paths[formationId]?.[selected];
  return (
    <View style={styles.wrap} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <Svg
        accessibilityLabel="Stage diagram, audience at the bottom"
        width="100%"
        height="100%"
        viewBox={`${-w / 2 - 0.6} -.4 ${w + 1.2} ${d + 1.2}`}
      >
        <Rect
          x={-w / 2}
          y={0}
          width={w}
          height={d}
          rx={0.15}
          fill={P.stage}
          stroke={P.line}
          strokeWidth={0.025}
        />
        {Array.from({ length: Math.floor(w) + 1 }, (_, i) => (
          <Line
            key={"x" + i}
            x1={-w / 2 + i}
            x2={-w / 2 + i}
            y1={0}
            y2={d}
            stroke={P.grid}
            strokeWidth={0.018}
            strokeDasharray=".03 .16"
          />
        ))}
        {Array.from({ length: Math.floor(d) + 1 }, (_, i) => (
          <Line
            key={"y" + i}
            x1={-w / 2}
            x2={w / 2}
            y1={i}
            y2={i}
            stroke={P.grid}
            strokeWidth={0.018}
            strokeDasharray=".03 .16"
          />
        ))}
        <Line
          x1={0}
          x2={0}
          y1={0}
          y2={d}
          stroke={P.subtle}
          strokeWidth={0.025}
          strokeDasharray=".12 .12"
        />
        {doc.cones.map((c) => (
          <G key={c.id} transform={`translate(${c.x} ${d - c.y})`}>
            {selectedCone === c.id && editing && (
              <Circle
                r={marker * 1.6}
                stroke={P.primary}
                strokeWidth={0.045}
                fill={P.selection}
              />
            )}
            <G transform={`scale(${Math.max(1, 12 / unit / 0.4)})`}>
              <Rect
                x={-0.2}
                y={0.12}
                width={0.4}
                height={0.075}
                rx={0.025}
                fill="#b45309"
              />
              <Polygon
                points="0,-.25 -.145,.14 .145,.14"
                fill="#f97316"
                stroke="#c2410c"
                strokeWidth={0.015}
              />
              <Polygon
                points="-.043,-.13 .043,-.13 .073,-.05 -.073,-.05"
                fill="white"
              />
              <Polygon
                points="-.099,.02 .099,.02 .126,.095 -.126,.095"
                fill="white"
              />
            </G>
            {editing && (
              <>
                <SvgText
                  x={0}
                  y={marker + label}
                  fontSize={label * 0.8}
                  textAnchor="middle"
                  fill={P.muted}
                >
                  {c.label}
                </SvgText>
                <Circle
                  accessibilityLabel={"Edit cone " + c.label}
                  onPress={() => onCone?.(c.id)}
                  r={Math.max(0.3, 22 / unit)}
                  fill="transparent"
                />
              </>
            )}
          </G>
        ))}
        {path && (
          <Path
            d={getPathSamples(path)
              .map((p, i) => `${i ? "L" : "M"}${p.x},${d - p.y}`)
              .join(" ")}
            fill="none"
            stroke={P.primary}
            strokeWidth={0.05}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {editing &&
          path &&
          path.points.map((p, i) => (
            <G key={"anchor-" + i} pointerEvents="none">
              <Circle
                cx={p.x}
                cy={d - p.y}
                r={Math.max(0.1, 4 / unit)}
                fill="white"
                stroke={path.locked ? P.subtle : P.primary}
                strokeWidth={0.035}
              />
              <SvgText
                x={p.x}
                y={d - p.y - label * 0.5}
                textAnchor="middle"
                fontSize={label * 0.7}
                fill={P.primary}
              >
                {i === 0
                  ? "START"
                  : i === path.points.length - 1
                    ? "END"
                    : String(i)}
              </SvgText>
            </G>
          ))}
        {doc.dancers.map((person, dancerIndex) => {
          const p = positions[person.id];
          if (!p) return null;
          const active = person.id === selected;
          return (
            <React.Fragment key={person.id}>
              <Circle
                accessibilityLabel={person.name}
                onPress={() => onSelect(person.id)}
                cx={p.x}
                cy={d - p.y}
                r={Math.max(marker, 22 / unit)}
                fill="transparent"
              />
              {active && (
                <Circle
                  cx={p.x}
                  cy={d - p.y}
                  r={marker * 1.4}
                  stroke={P.primary}
                  strokeWidth={0.035}
                  fill="none"
                />
              )}
              <Circle
                pointerEvents="none"
                cx={p.x}
                cy={d - p.y}
                r={marker}
                fill={
                  active
                    ? P.primary
                    : DANCER_PALETTE[dancerIndex % DANCER_PALETTE.length]
                }
                stroke="white"
                strokeWidth={0.035}
              />
              <SvgText
                onPress={() => onSelect(person.id)}
                x={p.x}
                y={d - p.y + marker + label}
                fontSize={label}
                textAnchor="middle"
                fontWeight={active ? "700" : "400"}
                fill={P.ink}
              >
                {person.name.split(" ")[0]}
              </SvgText>
            </React.Fragment>
          );
        })}
        <SvgText
          x={0}
          y={d + 0.58}
          fontSize={0.19}
          fill={P.muted}
          textAnchor="middle"
          letterSpacing={0.08}
        >
          AUDIENCE
        </SvgText>
      </Svg>
    </View>
  );
}
const styles = StyleSheet.create({ wrap: { flex: 1, minHeight: 100 } });
