# Wakilio

A practice management workspace for Indian advocates — matters, court diary, documents, dictation and AI drafting.

## Development

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/coop-jmv/Advocate.git
cd Advocate
bun install
bun run dev
```

Copy `.env.example` to `.env` and set your Supabase and AI gateway credentials before running.

## Scripts

- `bun run dev` — start the dev server
- `bun run build` — production build
- `bun run lint` — lint and format-check
- `bun run format` — auto-format with Prettier
