# Anthony Pierre Personal Website

This repository hosts a static one-page personal website for GitHub Pages:

https://NAOPOD.github.io

The site is built with plain HTML, CSS and vanilla JavaScript. The interactive knowledge graph uses D3.js from a CDN and does not require React, Vue, Next.js, Vite, npm or a build step.

## Structure

- `index.html` is the GitHub Pages entry point.
- `assets/css/style.css` contains the visual design and responsive layout.
- `assets/js/graph.js` loads and renders the D3 knowledge graph.
- `data/graph.json` contains the editable graph content.
- `assets/pdf/cv.pdf` is the expected path for the downloadable CV.

## Editing the Graph

Update `data/graph.json` to change the graph.

Each node can include:

```json
{
  "id": "unique-node-id",
  "label": "Visible node label",
  "type": "skill",
  "category": "Skill",
  "description": "Text shown in the side panel.",
  "skills": ["Python", "Finance"],
  "links": [
    { "label": "GitHub", "url": "https://github.com/NAOPOD" }
  ]
}
```

Each link connects two node IDs:

```json
{ "source": "finance", "target": "portfolio-management" }
```

Supported filter categories are `Domain`, `Project`, `Research`, `Experience`, `Education` and `Skill`. The central node uses `Center`.

## Adding a CV

Place the CV PDF at:

```text
assets/pdf/cv.pdf
```

The header, hero and contact links are already wired to this path.

## Local Testing

Because the graph is loaded with `fetch`, test the site through a local static server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deployment

Push the repository to GitHub with GitHub Pages enabled for the root of the main branch. The site will be available at:

```text
https://NAOPOD.github.io
```
