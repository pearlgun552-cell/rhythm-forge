"""Create an editable arrangement from local Basic Pitch output and reference onsets.
Run after generating .tmp-altale/notes.json. The source recording is never embedded.
"""
import json, math, hashlib
from pathlib import Path
import librosa
import numpy as np
from scipy.signal import find_peaks

source = Path('/Users/pearlgun/Music/网易云音乐/削除 - Altale.mp3')
events = sorted(json.loads(Path('.tmp-altale/notes.json').read_text()))
y, sr = librosa.load(source, sr=22050)
duration = len(y) / sr
bpm = 180.0  # Editing grid only: event times retain the reference's changing tempo.
bps = bpm / 60
length = math.ceil(duration * bps * 4) / 4
chroma = librosa.feature.chroma_stft(y=y, sr=sr).mean(axis=1)
profiles = [('major', np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])), ('minor', np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]))]
keys = sorted([(float(np.corrcoef(chroma, np.roll(profile, root))[0, 1]), root, mode) for mode, profile in profiles for root in range(12)], reverse=True)
names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
key = names[keys[0][1]] + ' ' + keys[0][2]
print('Key estimates',[(round(c, 3), names[r], m) for c, r, m in keys[:4]])
# Explicit time segments support editing without pretending to have a tempo map.
boundaries = [0, 16, 32, 48, 64, 80, 96, 112, 128, 144, duration]
sections = [{'id': f'altale-section-{i}', 'name': f'{i+1:02d} · {int(s)//60}:{int(s)%60:02d}', 'startBeat': round(s*bps, 6), 'durationBeats': round((e-s)*bps, 6)} for i,(s,e) in enumerate(zip(boundaries,boundaries[1:]))]
def instrument(preset, waveform, a, d, s, r, volume, piano=False):
    return {'type': 'sampled-piano' if piano else 'poly-synth', 'preset': preset, 'oscillator': waveform, 'adsr': {'attack': a, 'decay': d, 'sustain': s, 'release': r}, 'volume': volume, 'presetId': 'piano-grand' if piano else 'altale-'+preset}
specs = [
    ('Piano · Treble', instrument('soft-keys','triangle',.008,.2,.55,.18,.6,True), .65, .08),
    ('Piano · Harmony', instrument('soft-keys','triangle',.01,.3,.45,.24,.6,True), .54, -.10),
    ('Bass', instrument('bass','sine',.005,.14,.7,.09,.7), .6, 0),
    ('Upper accents', instrument('pluck','triangle',.004,.2,.12,.18,.6), .4, .14),
]
tracks=[]
for i,(name,inst,volume,pan) in enumerate(specs):
    clips=[{'id': f'altale-clip-{i}-{j}', 'name': name+' '+str(j+1), 'startBeat': s['startBeat'], 'durationBeats': s['durationBeats']} for j,s in enumerate(sections)]
    tracks.append({'id': f'altale-track-{i}', 'name': name, 'type': 'instrument', 'instrument': inst, 'volume': volume, 'pan': pan, 'mute': False, 'solo': False, 'notes': [], 'clips': clips})
# Keep every detected pitched event; assign playable registers rather than inventing chords.
for index,(start,end,pitch,amp) in enumerate(events):
    track_index = 2 if pitch < 48 else 1 if pitch < 67 else 0 if pitch < 89 else 3
    track=tracks[track_index]
    section_index=min(len(sections)-1,int(start//16))
    clip=track['clips'][section_index]
    # Split ties at clip boundaries without erasing any part of the detected note.
    cursor=start
    part=0
    while cursor < min(end,duration)-.001:
        j=min(len(sections)-1,int(cursor//16))
        limit=min(end,duration,boundaries[j+1])
        if limit <= cursor: break
        track['notes'].append({'id':f'altale-note-{index}-{part}', 'clipId':track['clips'][j]['id'], 'pitch':pitch, 'start':round(cursor*bps,6), 'duration':round((limit-cursor)*bps,6), 'velocity':round(float(np.clip(amp*1.6,.15,.96)),4)})
        cursor=limit;part+=1
# Percussive onsets from the supplied mix: no repeating synthetic beat template.
harmonic, percussion=librosa.effects.hpss(y)
S=np.abs(librosa.stft(percussion, n_fft=2048, hop_length=256))
f=librosa.fft_frequencies(sr=sr,n_fft=2048)
last_hits={}
drums=[]
for sound,low,high,distance in [('kick',35,180,.15),('snare',650,3000,.18),('closed-hat',6000,10000,.10)]:
    energy=np.sqrt(np.mean(S[(f>=low)&(f<high)]**2,axis=0))
    onset=np.maximum(0,np.diff(energy,prepend=energy[0]))
    threshold=max(np.percentile(onset,94)*.65,.01)
    peaks,_=find_peaks(onset,height=threshold,prominence=threshold*.5,distance=int(distance*sr/256))
    for peak in peaks:
        time=float(librosa.frames_to_time(peak,sr=sr,hop_length=256))
        if time < 1 or time >= duration: continue
        velocity=float(np.clip(onset[peak]/max(np.percentile(onset,99.5),.01)*.55,.12,.8))
        drums.append({'id':f'altale-{sound}-{peak}','pitch':{'kick':36,'snare':38,'closed-hat':42}[sound], 'drumSound':sound, 'start':round(time*bps,6),'duration':.15,'velocity':round(velocity,4)})
tracks.append({'id':'altale-drums','name':'Percussion · detected onsets','type':'drum','instrument':specs[2][1], 'volume':.3,'pan':0,'mute':False,'solo':False,'notes':sorted(drums,key=lambda n:n['start']), 'drumPattern':{'stepCount':16,'steps':{s:[False]*16 for s in ['kick','snare','closed-hat','open-hat','clap']}}})
synths=[]
for t in tracks:
    ins=t['instrument'];pid=ins['presetId']
    if ins['type']=='poly-synth' and not any(s['id']==pid for s in synths): synths.append({'id':pid,'name':t['name'],**{k:ins[k] for k in ['oscillator','adsr','volume']}})
project={'id':'altale-editable-study','schemaVersion':4,'name':'Altale · Editable reconstruction','bpm':bpm,'key':key,'timeSignature':{'numerator':4,'denominator':4},'projectLengthBeats':length,'loopEnabled':False,'loopStartBeat':0,'loopEndBeat':length,'tracks':tracks,'synths':synths,'sections':sections,'reverb':{'enabled':True,'mix':.16,'decay':1.6},'createdAt':'2026-09-13T00:00:00.000Z','updatedAt':'2026-09-13T00:00:00.000Z'}
Path('examples/altale-imitation.json').write_text(json.dumps(project,ensure_ascii=False,indent=2))
report={'source':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'referenceDurationSeconds':duration,'editingGridBpm':bpm,'eventTiming':'Absolute reference times preserved. Grid is not a verified constant-tempo transcription.','pitchCandidates':len(events),'pitchedNotesAfterClipSplits':sum(len(t['notes']) for t in tracks[:-1]),'percussionCandidates':len(drums),'projectDurationSeconds':length/bps,'tracks':[{ 'name':t['name'],'notes':len(t['notes'])} for t in tracks], 'limitations':['Mixed-audio automatic pitch estimates are not a manually verified score.','Percussion is estimated from frequency-band transients; orchestral attacks can produce false positives.','Built-in piano samples approximate the pitched arrangement; orchestral/effect timbres differ from the source.','Section markers partition reference time; no variable tempo map is encoded.']}
Path('examples/altale-analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
