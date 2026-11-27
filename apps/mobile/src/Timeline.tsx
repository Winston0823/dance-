import React, { useRef, useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  formatCount,
  type ProjectDocument,
} from "../../../packages/core/src/index.ts";
import { rulerBeat } from "./editing.ts";

const T = {
  background: "#1b1b22",
  surface: "#26262f",
  line: "#3d3d48",
  ink: "#fafafb",
  muted: "#bdbdc8",
  purple: "#e08a8a",
  selected: "#990000",
};
type Props = {
  doc: ProjectDocument;
  beat: number;
  onSeek: (n: number) => void;
  onSection: (start: number, end: number) => void;
  selectedFormation?: string;
  onFormation?: (id: string, beat: number) => void;
};
export default function Timeline({
  doc,
  beat,
  onSeek,
  onSection,
  selectedFormation,
  onFormation,
}: Props) {
  const [zoom, setZoom] = useState(1),
    [expanded, setExpanded] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    ruler = useRef<React.ComponentRef<typeof View>>(null),
    rulerX = useRef(0),
    dragging = useRef(false),
    latestPageX = useRef(0),
    gestureEpoch = useRef(0);
  const px = 12 * zoom,
    width = Math.max(1, doc.totalBeats * px),
    bodyHeight = expanded ? 162 : 110;
  useEffect(() => {
    if (!dragging.current)
      scroll.current?.scrollTo({
        x: Math.max(0, beat * px - 180),
        animated: false,
      });
  }, [Math.floor(beat / 8), zoom]);
  const seekPage = (pageX: number) =>
    onSeek(rulerBeat(pageX, rulerX.current, px, doc.totalBeats));
  const measureRuler = () =>
    ruler.current?.measureInWindow((x) => {
      rulerX.current = x;
    });
  const audioStart = ((-doc.offsetSeconds * doc.bpm) / 60) * px;
  const audioWidth = (((doc.audio?.duration ?? 0) * doc.bpm) / 60) * px;
  return (
    <View style={s.wrap}>
      <View style={s.tools}>
        <Text style={s.label}>CHOREOGRAPHY</Text>
        <View style={s.toolButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom timeline out"
            disabled={zoom <= 0.5}
            onPress={() => setZoom((v) => Math.max(0.5, v - 0.5))}
            style={s.tool}
          >
            <Text style={s.action}>−</Text>
          </Pressable>
          <Text style={s.zoom}>{zoom}×</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom timeline in"
            disabled={zoom >= 4}
            onPress={() => setZoom((v) => Math.min(4, v + 0.5))}
            style={s.tool}
          >
            <Text style={s.action}>＋</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              expanded ? "Collapse timeline" : "Expand timeline"
            }
            onPress={() => setExpanded(!expanded)}
            style={s.tool}
          >
            <Text style={s.action}>{expanded ? "Less ⌄" : "Details ⌃"}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        horizontal
        ref={scroll}
        onScroll={measureRuler}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator
        style={{ height: bodyHeight, flexGrow: 0 }}
        contentContainerStyle={{ width: width + 72, height: bodyHeight }}
      >
        <View style={{ width: width + 72, height: bodyHeight }}>
          {doc.sections.map((section, index) => (
            <View
              pointerEvents="box-none"
              key={section.id}
              style={[
                s.section,
                {
                  left: section.startBeat * px,
                  width: (section.endBeat - section.startBeat) * px,
                  backgroundColor: ["#e08a8a12", "#22d3ee0c", "#f472b60c"][
                    index % 3
                  ],
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Loop section ${section.title}, counts ${formatCount(section.startBeat)} to ${formatCount(section.endBeat)}`}
                onPress={() => onSection(section.startBeat, section.endBeat)}
                style={s.sectionButton}
              >
                <Text numberOfLines={1} style={s.sectionTitle}>
                  {section.title}
                </Text>
              </Pressable>
            </View>
          ))}
          <View
            ref={ruler}
            collapsable={false}
            onLayout={measureRuler}
            style={[s.ruler, { width }]}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponderCapture={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(event) => {
              dragging.current = true;
              latestPageX.current = event.nativeEvent.pageX;
              const epoch = ++gestureEpoch.current;
              ruler.current?.measureInWindow((x) => {
                if (epoch !== gestureEpoch.current) return;
                rulerX.current = x;
                seekPage(latestPageX.current);
              });
            }}
            onResponderMove={(event) => {
              latestPageX.current = event.nativeEvent.pageX;
              seekPage(latestPageX.current);
            }}
            onResponderRelease={() => {
              dragging.current = false;
            }}
            onResponderTerminate={() => {
              gestureEpoch.current++;
              dragging.current = false;
            }}
            accessibilityRole="adjustable"
            accessibilityLabel={`Timeline, count ${formatCount(beat)}`}
            accessibilityActions={[
              { name: "increment" },
              { name: "decrement" },
            ]}
            onAccessibilityAction={(event) =>
              onSeek(
                Math.max(
                  0,
                  Math.min(
                    doc.totalBeats,
                    beat +
                      (event.nativeEvent.actionName === "increment"
                        ? 0.25
                        : -0.25),
                  ),
                ),
              )
            }
          >
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {Array.from(
                { length: Math.ceil(doc.totalBeats / 8) },
                (_, index) => (
                  <Text key={index} style={[s.tick, { left: index * 8 * px }]}>
                    {index + 1}·1
                  </Text>
                ),
              )}
            </View>
          </View>
          {doc.formations.map((formation, index) => (
            <Pressable
              key={formation.id}
              accessibilityRole="button"
              accessibilityLabel={`Select ${formation.title}, arrival ${formatCount(formation.beat)}, transition ${formation.transitionBeats} beats`}
              onPress={() =>
                onFormation
                  ? onFormation(formation.id, formation.beat)
                  : onSeek(formation.beat)
              }
              style={[
                s.formation,
                {
                  left: formation.beat * px,
                  width: Math.max(
                    38,
                    ((doc.formations[index + 1]?.beat ?? doc.totalBeats) -
                      formation.beat) *
                      px -
                      4,
                  ),
                },
                selectedFormation === formation.id && s.selected,
              ]}
            >
              <Text numberOfLines={1} style={s.formationText}>
                {formation.title}
              </Text>
            </Pressable>
          ))}
          {expanded && (
            <>
              {doc.formations.slice(1).map((f) => (
                <View
                  pointerEvents="none"
                  key={"transition-" + f.id}
                  style={[
                    s.transition,
                    {
                      left: (f.beat - f.transitionBeats) * px,
                      width: f.transitionBeats * px,
                    },
                  ]}
                >
                  <Text numberOfLines={1} style={s.transitionText}>
                    {f.transitionBeats} beats →
                  </Text>
                </View>
              ))}
              {doc.audio && doc.audio.peaks.length > 0 && audioWidth > 0 ? (
                <Svg
                  pointerEvents="none"
                  style={{ position: "absolute", top: 137, left: audioStart }}
                  width={audioWidth}
                  height={23}
                >
                  <Path
                    d={doc.audio.peaks
                      .map(
                        (p, i) =>
                          `M${(i / doc.audio!.peaks.length) * audioWidth},${11 - p * 10}v${p * 20}`,
                      )
                      .join(" ")}
                    stroke={T.purple}
                    strokeWidth={1.2}
                  />
                </Svg>
              ) : (
                <Text style={s.empty}>
                  {doc.audio
                    ? "Music attached · waveform unavailable"
                    : "Count-only · upload music in the web editor"}
                </Text>
              )}
            </>
          )}
          <View pointerEvents="none" style={[s.playhead, { left: beat * px }]}>
            <View style={s.cap} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: {
    backgroundColor: T.background,
    borderTopWidth: 1,
    borderColor: T.line,
  },
  tools: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  label: {
    color: T.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.3,
  },
  toolButtons: { flexDirection: "row", alignItems: "center", gap: 3 },
  tool: {
    minHeight: 40,
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  action: { color: T.purple, fontWeight: "700", fontSize: 13 },
  zoom: { color: T.ink, fontSize: 11, minWidth: 28, textAlign: "center" },
  section: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderColor: T.line,
  },
  sectionButton: { height: 32, justifyContent: "center", paddingHorizontal: 9 },
  sectionTitle: { color: T.ink, fontSize: 12, fontWeight: "700" },
  ruler: {
    position: "absolute",
    top: 32,
    left: 0,
    height: 36,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: T.line,
  },
  tick: {
    position: "absolute",
    top: 7,
    fontSize: 11,
    color: T.muted,
    borderLeftWidth: 1,
    borderColor: "#727283",
    paddingLeft: 6,
  },
  formation: {
    position: "absolute",
    top: 70,
    height: 36,
    paddingHorizontal: 8,
    justifyContent: "center",
    backgroundColor: "#3b3b48",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#626270",
  },
  selected: { backgroundColor: T.selected, borderColor: T.purple },
  formationText: { color: T.ink, fontSize: 11, fontWeight: "600" },
  transition: {
    position: "absolute",
    top: 112,
    height: 20,
    backgroundColor: "#42425180",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  transitionText: { color: T.muted, fontSize: 10 },
  empty: {
    position: "absolute",
    top: 139,
    left: 9,
    fontSize: 10,
    color: T.muted,
  },
  playhead: {
    position: "absolute",
    top: 31,
    bottom: 0,
    width: 2,
    backgroundColor: T.purple,
  },
  cap: {
    width: 8,
    height: 8,
    backgroundColor: T.purple,
    transform: [{ translateX: -3 }, { rotate: "45deg" }],
  },
});
