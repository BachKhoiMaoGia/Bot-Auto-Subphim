# Bot-Auto-Subphim

Web tool local de clean timecode SRT theo cong thuc V2.0 cho OCR sub tho.

## Tinh nang

- Keo tha toi da 30 file `.srt` cung luc.
- Tu dong xu ly timecode theo cong thuc:
	- `Ideal_Start = Raw_Start - 100ms`
	- `Ideal_End = Raw_End + 300ms`
- Xu ly xung dot giua 2 cau lien tiep:
	- Case A (Critical Overlap): `Ideal_Start_N+1 < Raw_End_N`
		- `Final_End_N = Raw_End_N`
		- `Final_Start_N+1 = Raw_End_N`
	- Case B (Tail Overlap): `Ideal_Start_N+1 > Raw_End_N` va `< Ideal_End_N`
		- `Final_End_N = Ideal_Start_N+1`
		- `Final_Start_N+1 = Ideal_Start_N+1`
	- Case C (No Overlap): giu nguyen thong so ly tuong.
- Tai tung file hoac tai tat ca file da xu ly.

## Chay local nhanh

1. Di chuyen vao thu muc project:

```bash
cd /workspaces/Bot-Auto-Subphim
```

2. Chay web server tinh:

```bash
python3 -m http.server 8080
```

3. Mo trinh duyet:

```text
http://localhost:8080
```

## Cau truc file

- `index.html`: giao dien keo-tha va bang ket qua
- `styles.css`: giao dien responsive, gon nhe
- `app.js`: parser SRT + cong thuc timecode V2.0 + xuat file