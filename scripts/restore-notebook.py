from pathlib import Path
import subprocess

root=Path(__file__).resolve().parents[1]
board=root/'mobile/src/screens/Board.js'
current=board.read_text(encoding='utf-8')
backup=root/'artifacts/uiux-qa/before-notebook-restore'
backup.mkdir(parents=True,exist_ok=True)
for name in ['mobile/src/screens/Board.js','mobile/App.js','mobile/src/design.js','desktop/src/styles.css','desktop/src/App.jsx']:
 (backup/Path(name).name).write_bytes((root/name).read_bytes())
line=current.split('export default function Board()')[0]
line=line.replace('function TaskLine(', 'export function TaskLine(').replace('function DateSheet(', 'export function DateSheet(')
line=line.replace('paddingHorizontal:8,paddingVertical:10','paddingHorizontal:0,paddingVertical:5')
line=line.replace('gap:9,paddingHorizontal:0','gap:6,paddingHorizontal:0')
line=line.replace('fontSize:16,lineHeight:23','fontSize:15,lineHeight:21')
line=line.replace('width:23,height:23,borderRadius:8','width:19,height:19,borderRadius:6')
line=line.replace('paddingVertical:8,paddingHorizontal:2','paddingVertical:7,paddingHorizontal:0')
line=line.replace('name="drag" size={18}','name="drag" size={13}')
line=line.replace('name="calendar" size={18}','name="calendar" size={15}')
(root/'mobile/src/screens/NotebookLine.js').write_text(line,encoding='utf-8')

original=subprocess.check_output(['git','show','HEAD:mobile/src/screens/Board.js'],cwd=root).decode('utf-8')
month=original[original.index('function MonthView('):original.index('export default function Board(')]
month=month.replace('function MonthView({ db, kind, ym, setYm, openDay }) {','export default function MonthView({ db, ym, setYm, openDay }) {\n  const T=useDesign(), styles=makeStyles(T);\n  const kind="todo";')
month=month.replace("    if (kind === 'content') edge = channelColor(t.channel);\n    else {",'    {')
styles=original[original.index('const styles = StyleSheet.create('):].replace('const styles = StyleSheet.create(', 'const makeStyles = T => StyleSheet.create(').replace('T.border','T.edge').replace('T.glassEdge','T.edge')
prefix="""import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useDesign } from '../design.js';
import { localDateStr, todayStr, effectiveTeamId, importantHighlight } from '../util.js';
import { shadow } from '../theme.js';
function GhostButton({label,onPress}) { const d=useDesign(); return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{paddingHorizontal:10,paddingVertical:7}}><Text style={{fontSize:13,color:d.muted}}>{label}</Text></Pressable>; }
"""
styles=styles.replace("backgroundColor: 'rgba(255,255,255,0.35)'",'backgroundColor: T.fill').replace("backgroundColor: 'rgba(255,255,255,0.85)'",'backgroundColor: T.input').replace("backgroundColor: 'rgba(255,255,255,0.7)'",'backgroundColor: T.input')
(root/'mobile/src/screens/NotebookMonth.js').write_text(prefix+month+styles,encoding='utf-8')

css=root/'desktop/src/styles.css'
s=css.read_text(encoding='utf-8')
start=s.index('/* Unified glass surfaces */')
before,after=s[:start],s[start:]
remove=[':root { --accent:', '.topbar {', '.logo {', '.logo-dot {', '.main-tab {', '.main-tab.active {', '.top-icons {', '.card,.memo-day.today,', '.month-cell {', '.memo-line {', '.memo-line:hover {']
after='\n'.join(l for l in after.splitlines() if not any(l.startswith(p) for p in remove))
after=after.replace('.main-tabs { display:flex;gap:4px;margin-left:25px; }','.main-tabs { display:flex;gap:4px; }')
after+='\n/* Keep the original compact notebook chrome. Glass changes only the material. */\n.topbar { z-index:20; overflow:visible; backdrop-filter:blur(24px) saturate(160%); }\n.logo { border:0; padding:0; font-size:14px; cursor:pointer; }\n.connect-nav { padding:7px 11px; border-radius:10px; font-size:12px; margin:0 8px; box-shadow:none; }\n.top-icons { align-items:center; }\n'
css.write_text(before+after,encoding='utf-8')
app=root/'desktop/src/App.jsx'
s=app.read_text(encoding='utf-8').replace('체커<span className="logo-dot" />','✓ 체커')
s=s.replace("[['todos','TODOs'],['teams','팀'],['buckets','버킷']]","[['teams','팀'],['buckets','버킷']]")
app.write_text(s,encoding='utf-8')
