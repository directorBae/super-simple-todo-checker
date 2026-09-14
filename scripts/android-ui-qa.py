from pathlib import Path
import os, subprocess, sys, json, re, time, xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
ADB = str(Path(os.environ['LOCALAPPDATA']) / 'Android/Sdk/platform-tools/adb.exe')
def adb(*args):
    return subprocess.check_output([ADB, '-s', 'emulator-5580', *map(str,args)])
def dump():
    adb('shell','uiautomator','dump','/sdcard/checker-ui.xml')
    raw=adb('shell','cat','/sdcard/checker-ui.xml')
    return ET.fromstring(raw)
def center(node):
    x1,y1,x2,y2=map(int,re.findall(r'\d+',node.attrib['bounds']))
    return (x1+x2)//2,(y1+y2)//2
def tap(label):
    nodes=list(dump().iter('node'))
    node=next((n for n in nodes if n.get('content-desc')==label),None)
    if node is None: node=next((n for n in nodes if n.get('text')==label),None)
    if node is None: raise RuntimeError('Missing control: '+label)
    adb('shell','input','tap',*center(node));time.sleep(.4)
def text(value): adb('shell','input','text',value.replace(' ','%s'))
def shot(name): (ROOT/'artifacts/uiux-qa'/f'{name}.png').write_bytes(adb('exec-out','screencap','-p'))
if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='dump':
        for n in dump().iter('node'):
            if n.get('text') or n.get('content-desc'): print(json.dumps({k:n.get(k) for k in ['text','content-desc','class','bounds','focused']},ensure_ascii=False))
    elif mode=='tap':tap(sys.argv[2])
    elif mode=='text':text(sys.argv[2])
    elif mode=='shot':shot(sys.argv[2])
