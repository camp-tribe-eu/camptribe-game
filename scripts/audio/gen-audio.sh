#!/usr/bin/env bash
# GAME-194 · власний синтез звуків (ffmpeg lavfi, без чужих семплів): шум, фільтри й тони. Перше джерело — цей скрипт, тож
# ліцензія — наша, віддана як CC0 (див. docs/LICENSE_REGISTER.md SND-004…). Kenney/OGA із сесії закриті (скіл game-art-sources §1).
# Запуск: bash scripts/audio/gen-audio.sh  → public/audio/{amb,sfx}-*.ogg (моно, 22,05 кГц, Vorbis).
set -euo pipefail
cd "$(dirname "$0")/../.."
out=public/audio
enc=(-ac 1 -ar 22050 -c:a libvorbis -q:a 1)
n() { echo "anoisesrc=d=$2:c=$1:r=22050:a=${3:-0.5}:seed=${4:-7}"; }
# amb <name> <dur> <lavfi-graph> : петля; 40 мс злами на краях гасять клік на шві.
amb() { ffmpeg -v error -y -f lavfi -i "$3" -af "afade=t=in:d=0.04,afade=t=out:st=$(awk "BEGIN{printf \"%.2f\", $2-0.04}"):d=0.04,alimiter=limit=0.9" "${enc[@]}" "$out/amb-$1.ogg"; }
sfx() { ffmpeg -v error -y -f lavfi -i "$2" -af "afade=t=out:st=$(awk "BEGIN{printf \"%.2f\", $3-0.03}"):d=0.03,alimiter=limit=0.9" -t "$3" "${enc[@]}" "$out/sfx-$1.ogg"; }

# Табір: вітер (рожевий шум, повільна хвиля) + пташині цвірінькання (гейтовані тони).
amb camp 14 "$(n pink 14 0.5),lowpass=f=700,tremolo=f=0.23:d=0.6,volume=0.5[w];aevalsrc='0.10*sin(2*PI*(3200+700*sin(2*PI*9*t))*t)*lt(mod(t,4.3),0.16)+0.08*sin(2*PI*(4100+500*sin(2*PI*14*t))*t)*lt(mod(t+1.7,5.9),0.12)':d=14:s=22050[b];[w][b]amix=inputs=2:normalize=0,volume=9dB"
# Берег озера: хвилі — коричневий шум із повільною амплітудою.
amb lake 14 "$(n brown 14 0.9),lowpass=f=900,tremolo=f=0.28:d=0.7,volume=1.2[a];$(n pink 14 0.2 3),bandpass=f=1800:w=1200,tremolo=f=0.28:d=0.9,volume=0.35[b];[a][b]amix=inputs=2:normalize=0"
# Вогнище: низьке гуркотіння + тріск (гейт різко вирізає випадкові сплески).
amb fire 12 "$(n white 12 0.9 5),highpass=f=1500,agate=threshold=0.35:attack=1:release=25,volume=0.9[c];$(n brown 12 0.7 9),lowpass=f=300,volume=0.7[r];[c][r]amix=inputs=2:normalize=0"
# Дощ: широкосмуговий шум.
amb rain 12 "$(n white 12 0.5 11),highpass=f=700,lowpass=f=9000,volume=0.8[a];$(n brown 12 0.5 2),lowpass=f=400,volume=0.5[b];[a][b]amix=inputs=2:normalize=0"
# Дорога (авто): гул двигуна 55/110 Гц + шум шин.
amb road-car 10 "aevalsrc='0.35*sin(2*PI*55*t)+0.2*sin(2*PI*110*t+0.5)+0.1*sin(2*PI*165*t)':d=10:s=22050,tremolo=f=14:d=0.15[e];$(n brown 10 0.5 4),lowpass=f=500,volume=0.6[t];[e][t]amix=inputs=2:normalize=0"
# Дорога (велосипед): тихий тік ланцюга ~7 Гц + вітер.
amb road-bike 10 "aevalsrc='0.9*lt(mod(t,0.14),0.003)*(2*random(0)-1)':d=10:s=22050,bandpass=f=2500:w=1500,volume=0.9[k];$(n pink 10 0.3 6),lowpass=f=900,volume=0.5[w];[k][w]amix=inputs=2:normalize=0,volume=10dB"

# Крамниця (GAME-204): тиха кімнатна «тиша» — вентиляція (рожевий шум, низькі частоти) + рідкий шурхіт пакувань і далекий дзенькіт каси.
amb shop 12 "$(n pink 12 0.25 21),lowpass=f=500,tremolo=f=0.15:d=0.3,volume=0.35[v];$(n white 12 0.6 23),highpass=f=3000,agate=threshold=0.55:attack=1:release=60,volume=0.12[r];aevalsrc='0.05*sin(2*PI*2300*t)*exp(-9*mod(t,6.1))*lt(mod(t,6.1),0.4)':d=12:s=22050[k];[v][r][k]amix=inputs=3:normalize=0,volume=6dB"
# Ефекти.
sfx peg "aevalsrc='0.9*sin(2*PI*(170-60*t)*t)*exp(-14*t)+0.5*(2*random(0)-1)*exp(-60*t)':d=0.3:s=22050" 0.3
sfx chop "aevalsrc='0.8*(2*random(0)-1)*exp(-45*t)+0.7*sin(2*PI*110*t)*exp(-18*t)':d=0.3:s=22050,lowpass=f=3500" 0.3
sfx match "aevalsrc='(2*random(0)-1)*(0.5*min(1,t/0.25)*exp(-3*t)+0.8*exp(-80*(t-0.25))*gte(t,0.25))':d=0.6:s=22050,highpass=f=1200" 0.6
sfx cast "aevalsrc='(2*random(0)-1)*sin(PI*t/0.45)*0.8':d=0.45:s=22050,bandpass=f=1800:w=1400,volume=26dB" 0.45
sfx splash "aevalsrc='(2*random(0)-1)*exp(-9*t)*0.9':d=0.5:s=22050,lowpass=f=3500,highpass=f=300" 0.5
sfx catch "aevalsrc='0.45*(sin(2*PI*784*t)*exp(-7*t)+sin(2*PI*988*(t-0.12))*exp(-7*(t-0.12))*gte(t,0.12)+sin(2*PI*1319*(t-0.24))*exp(-6*(t-0.24))*gte(t,0.24))':d=0.8:s=22050" 0.8
sfx branch "aevalsrc='0.7*(2*random(0)-1)*exp(-120*t)+0.6*(2*random(0)-1)*exp(-100*(t-0.07))*gte(t,0.07)':d=0.25:s=22050,highpass=f=800" 0.25
# Дзвіночок на дверях крамниці: дві гармоніки дзвону з швидким згасанням, друга чутно пізніше.
sfx chime "aevalsrc='0.5*(sin(2*PI*2093*t)+0.4*sin(2*PI*5300*t))*exp(-6*t)+0.4*(sin(2*PI*2637*(t-0.18))+0.3*sin(2*PI*6600*(t-0.18)))*exp(-6*(t-0.18))*gte(t,0.18)':d=1.1:s=22050" 1.1
ls -l $out; du -cb $out/amb-*.ogg $out/sfx-*.ogg | tail -1
