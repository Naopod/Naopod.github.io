(function () {
  const svg = d3.select("#knowledge-graph");
  const status = document.querySelector("#graph-status");
  const backButton = document.querySelector("#back-button");

  const colors = {
    Center: "#8ed5e2",
    Projects: "#e4a66a",
    Research: "#bfa7ff",
    Experience: "#91d18b",
    Education: "#77aef2"
  };

  let dataset = null;
  let currentView = "home";
  let simulation = null;
  let zoomBehavior = null;
  let stage = null;
  let linkSelection = null;
  let nodeSelection = null;
  let labelSelection = null;
  let descriptionSelection = null;

  function viewport() {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  function radiusFor(node) {
    if (node.isCenter) return currentView === "home" ? 42 : 48;
    return currentView === "home" ? 31 : 23;
  }

  function linkDistance(link) {
    const hasCenter = link.source.isCenter || link.target.isCenter;
    if (currentView === "home") return hasCenter ? 210 : 165;
    return hasCenter ? 145 : 105;
  }

  function buildView(viewName) {
    const view = dataset.views[viewName] || dataset.views.home;
    const center = {
      ...view.center,
      isCenter: true,
      x: 0,
      y: 0,
      fx: 0,
      fy: 0
    };
    const nodes = [center, ...view.nodes.map((node) => ({ ...node, isCenter: false }))];
    return {
      nodes,
      links: view.links.map((link) => ({ ...link }))
    };
  }

  function connectedIds(node, graph) {
    const ids = new Set([node.id]);
    graph.links.forEach((link) => {
      const sourceId = typeof link.source === "object" ? link.source.id : link.source;
      const targetId = typeof link.target === "object" ? link.target.id : link.target;
      if (sourceId === node.id) ids.add(targetId);
      if (targetId === node.id) ids.add(sourceId);
    });
    return ids;
  }

  function setHighlight(node, graph) {
    const ids = connectedIds(node, graph);
    nodeSelection.classed("is-muted", (item) => !ids.has(item.id)).classed("is-active", (item) => item.id === node.id);
    labelSelection.classed("is-muted", (item) => !ids.has(item.id));
    descriptionSelection.classed("is-muted", (item) => !ids.has(item.id));
    linkSelection
      .classed("is-muted", (link) => !ids.has(link.source.id) || !ids.has(link.target.id))
      .classed("is-active", (link) => link.source.id === node.id || link.target.id === node.id);
  }

  function clearHighlight() {
    nodeSelection.classed("is-muted", false).classed("is-active", false);
    labelSelection.classed("is-muted", false);
    descriptionSelection.classed("is-muted", false);
    linkSelection.classed("is-muted", false).classed("is-active", false);
  }

  function zoomToCenter(scale) {
    const { width, height } = viewport();
    svg
      .transition()
      .duration(760)
      .ease(d3.easeCubicOut)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(scale));
  }

  function openView(node) {
    if (!node.view) return;
    render(node.view, node.id);
  }

  function render(viewName, sourceNodeId) {
    currentView = viewName;
    backButton.hidden = currentView === "home";

    const graph = buildView(viewName);
    const { width, height } = viewport();

    if (simulation) simulation.stop();

    svg.attr("viewBox", [0, 0, width, height]);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    const glow = defs.append("filter").attr("id", "soft-glow");
    glow.append("feGaussianBlur").attr("stdDeviation", 4).attr("result", "blur");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    stage = svg.append("g").attr("class", "stage");
    const linkLayer = stage.append("g").attr("class", "links");
    const nodeLayer = stage.append("g").attr("class", "nodes");
    const textLayer = stage.append("g").attr("class", "texts");

    linkSelection = linkLayer
      .selectAll("line")
      .data(graph.links)
      .join("line")
      .attr("class", "graph-link");

    nodeSelection = nodeLayer
      .selectAll("circle")
      .data(graph.nodes)
      .join("circle")
      .attr("class", (node) => `graph-node${node.isCenter ? " is-center" : ""}`)
      .attr("r", radiusFor)
      .attr("fill", (node) => colors[node.category] || colors.Center)
      .attr("filter", "url(#soft-glow)")
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (node) => `${node.label}. ${node.description || ""}`)
      .on("mouseenter focus", (_event, node) => setHighlight(node, graph))
      .on("mouseleave blur", clearHighlight)
      .on("click keydown", (event, node) => {
        if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openView(node);
      })
      .call(
        d3
          .drag()
          .on("start", (event, node) => {
            if (!event.active) simulation.alphaTarget(0.25).restart();
            node.fx = node.x;
            node.fy = node.y;
          })
          .on("drag", (event, node) => {
            node.fx = event.x;
            node.fy = event.y;
          })
          .on("end", (event, node) => {
            if (!event.active) simulation.alphaTarget(0);
            if (!node.isCenter) {
              node.fx = null;
              node.fy = null;
            }
          })
      );

    labelSelection = textLayer
      .selectAll("text.graph-label")
      .data(graph.nodes)
      .join("text")
      .attr("class", (node) => `graph-label${node.isCenter ? " is-center" : ""}`)
      .attr("dy", (node) => radiusFor(node) + 18)
      .text((node) => node.label);

    descriptionSelection = textLayer
      .selectAll("text.graph-description")
      .data(graph.nodes.filter((node) => !node.isCenter))
      .join("text")
      .attr("class", "graph-description")
      .attr("dy", (node) => radiusFor(node) + 34)
      .text((node) => node.description || "");

    simulation = d3
      .forceSimulation(graph.nodes)
      .force(
        "link",
        d3
          .forceLink(graph.links)
          .id((node) => node.id)
          .distance(linkDistance)
          .strength(0.62)
      )
      .force("charge", d3.forceManyBody().strength((node) => (node.isCenter ? -900 : -420)))
      .force("center", d3.forceCenter(0, 0))
      .force("x", d3.forceX(0).strength(0.055))
      .force("y", d3.forceY(0).strength(0.055))
      .force("collide", d3.forceCollide().radius((node) => radiusFor(node) + 34).iterations(3))
      .on("tick", () => {
        linkSelection
          .attr("x1", (link) => link.source.x)
          .attr("y1", (link) => link.source.y)
          .attr("x2", (link) => link.target.x)
          .attr("y2", (link) => link.target.y);

        nodeSelection.attr("cx", (node) => node.x).attr("cy", (node) => node.y);
        labelSelection.attr("x", (node) => node.x).attr("y", (node) => node.y);
        descriptionSelection.attr("x", (node) => node.x).attr("y", (node) => node.y);
      });

    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.35, 4])
      .on("zoom", (event) => {
        stage.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);
    zoomToCenter(currentView === "home" ? 0.95 : 1.22);

    if (sourceNodeId) {
      const centerNode = graph.nodes.find((node) => node.isCenter);
      if (centerNode) {
        setTimeout(() => setHighlight(centerNode, graph), 220);
      }
    }

    status.hidden = true;
  }

  backButton.addEventListener("click", () => render("home"));

  window.addEventListener("resize", () => {
    const { width, height } = viewport();
    svg.attr("viewBox", [0, 0, width, height]);
    if (zoomBehavior) zoomToCenter(currentView === "home" ? 0.95 : 1.22);
  });

  d3.json("data/graph.json")
    .then((loaded) => {
      dataset = loaded;
      render("home");
    })
    .catch((error) => {
      console.error("Could not load graph data:", error);
      status.hidden = false;
      status.textContent = "Graph data could not be loaded.";
    });
})();
