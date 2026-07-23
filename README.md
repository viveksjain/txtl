# txtl

A fast, no frills collection of TeXt uTiLities (thus txtl). Generates a purely static webpage, all data is processed locally.

Check it out at https://viveksjain.github.io/txtl/

## Features

https://github.com/user-attachments/assets/6f9ba70e-108e-4a5c-970f-2112d6c9e6a3

 - Autodetect mode - tries to figure out which of the modes below to use based on the text you paste in
 - Text diff - shows side-by-side diff view. (Click on the right pane and hit Cmd-V or Ctrl-V to paste and automatically switch to this mode.)
 - JSON pretty print
 - Unix epoch time parsing (supports seconds and milliseconds since epoch)
 - Timezone conversion - parses timestamps and simple times such as `2026-07-22T16:30:00Z`, `4pm`, and `4pm UTC`, then displays local and UTC time
 - Number conversion between decimal, hex, octal and binary (to convert from the latter three, start your number with 0x, 0o or 0b, respectively)
 - URL encoding/decoding
 - Base64 encoding/decoding

## Development

1. Install dependencies

```
npm install
```

2. Run development server

```
npm run dev
```

To run the test suite, run `npm test`. To build a version for production, run `npm run build`.
