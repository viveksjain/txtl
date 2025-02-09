# Tootils

A fast, no frills collection of text utilities (t-utils, thus tootils). Generates a purely static webpage, all data is processed locally.

Check it out at https://tootils.vivekja.in

## Features

https://github.com/user-attachments/assets/6f9ba70e-108e-4a5c-970f-2112d6c9e6a3

 - Autodetect mode - tries to figure out which of the modes below to use based on the text you paste in
 - Text diff - shows side-by-side diff view. (Click on the right pane and hit Cmd-V or Ctrl-V to paste and automatically switch to this mode.)
 - JSON pretty print
 - Unix epoch time parsing (supports seconds and milliseconds since epoch)
 - Number conversion between decimal, hex, octal and binary (to convert from the latter three, start your number with 0x, 0o or 0b, respectively)

## Development

1. Install dependencies

```
npm install
```

2. Run development server

```
npm run dev
```

To build a version for production, run `npm run build`.
