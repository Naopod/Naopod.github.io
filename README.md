# Anthony Pierre Personal Graph

Static GitHub Pages personal site:

```text
https://NAOPOD.github.io
```

The site is a full-screen dark-mode knowledge graph built with plain HTML, CSS, vanilla JavaScript and D3.js from a CDN. There is no npm dependency and no build step.

## Structure

- `index.html` is the GitHub Pages entry point.
- `assets/css/style.css` contains the full-screen dark UI.
- `assets/js/graph.js` renders the D3 graph and handles view transitions.
- `data/graph.json` contains the editable graph content.

## Editing the Graph

The graph uses view-based navigation. The first view is `home`, with four main nodes:

- `Projects`
- `Research`
- `Experience`
- `Education`

When a user clicks one of these nodes, `assets/js/graph.js` loads the matching view from `data/graph.json`.

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
