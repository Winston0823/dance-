// Synthetic local audio fixture, never a recording or copyrighted rehearsal track.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const rate=22050,seconds=8,samples=rate*seconds;
const wav=Buffer.alloc(44+samples*2);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++){const t=i/rate,phase=t%.5;const v=phase<.035?Math.sin(2*Math.PI*1000*phase)*Math.sin(Math.PI*phase/.035)*.45:0;wav.writeInt16LE(Math.round(v*32767),44+i*2)}
mkdirSync(resolve('artifacts'),{recursive:true});
const output=resolve('artifacts','generated-count-test.wav');writeFileSync(output,wav);console.log(output);
