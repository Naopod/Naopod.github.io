# Anthony Pierre Personal Graph

Static GitHub Pages personal site:

```text
https://NAOPOD.github.io
```

The site is a full-screen dark-mode 3D knowledge graph built with plain HTML, CSS, vanilla JavaScript and Three.js from a CDN. There is no npm dependency and no build step.

## Structure

- `index.html` is the GitHub Pages entry point.
- `assets/css/style.css` contains the full-screen dark UI.
- `assets/js/graph.js` renders the Three.js planetary graph and handles view transitions.
- `data/graph.json` contains the editable graph content.
- `assets/pdf/cv.pdf` contains the CV used as source material for the graph.

## Editing the Graph

The graph uses view-based navigation. The first view is `home`, with four main nodes:

- `Projects`
- `Research`
- `Experience`
- `Education`

When a user clicks one of these planets, `assets/js/graph.js` loads the matching view from `data/graph.json`.
When a user clicks a sub-node, an information panel opens with details from the node.

The `Projects` view is split into two secondary views:

- `academic-projects`
- `non-academic-projects`

Each view has:

```json
{
  "center": {
    "id": "projects",
    "label": "Projects",
    "category": "Projects",
    "description": "Applied tools and prototypes"
  },
  "nodes": [],
  "links": []
}
```

To make a node open another view, add a `view` property:

```json
{
  "id": "projects",
  "label": "Projects",
  "category": "Projects",
  "description": "Applied tools and prototypes",
  "view": "projects"
}
```

Sub-node details are stored as a `details` array:

```json
{
  "id": "ecole-polytechnique",
  "label": "Ecole Polytechnique",
  "category": "Education",
  "description": "MSC&T Second Year, Economics, Data Analytics and Corporate Finance, Finance track.",
  "details": [
    "Period: Sept 2024 - Sept 2025.",
    "Coursework: Stochastic Calculus, Financial Markets, Private Equity."
  ]
}
```

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

Push the repository to GitHub with GitHub Pages enabled for the root of the `main` branch. The site will be available at:

```text
https://NAOPOD.github.io
```
