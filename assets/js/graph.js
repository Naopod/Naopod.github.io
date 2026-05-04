(function () {
  const svg = d3.select("#knowledge-graph");
  const status = document.querySelector("#graph-status");
  const panel = {
    category: document.querySelector("#panel-category"),
    title: document.querySelector("#panel-title"),
    description: document.querySelector("#panel-description"),
    skills: document.querySelector("#panel-skills"),
    links: document.querySelector("#panel-links")
  };
  const filterButtons = document.querySelectorAll(".filter-button");
  const searchInput = document.querySelector("#node-search");
  const resetButton = document.querySelector("#reset-view");

  const colors = {
    Center: "#0f3d4c",
    Domain: "#1f6f78",
    Research: "#6c5b7b",
    Project: "#b45f3c",
    Experience: "#61764b",
    Education: "#8a6f3f",
    Skill: "#4f6d8a"
  };

  let graphData = null;
  let simulation = null;
  let zoomBehavior = null;
  let container = null;
  let nodeSelection = null;
  let linkSelection = null;
  let labelSelection = null;
  let currentFilter = "All";
  let currentSearch = "";

  function radiusFor(node) {
    if (node.type === "center") return 34;
    if (node.type === "domain") return 23;
    if (node.category === "Project") return 18;
    return 13;
  }

  function linkDistance(link) {
    const sourceType = link.source.type || "";
    const targetType = link.target.type || "";
    if (sourceType === "center" || targetType === "center") return 145;
    if (sourceType === "domain" || targetType === "domain") return 108;
    return 82;
  }

  function getDimensions() {
    const parent = svg.node().parentElement;
    return {
      width: Math.max(parent.clientWidth, 320),
      height: Math.max(parent.clientHeight, 420)
    };
  }

  function updatePanel(node) {
    panel.category.textContent = node.category || node.type || "Node";
    panel.title.textContent = node.label;
    panel.description.textContent = node.description || "No description available yet.";

    panel.skills.innerHTML = "";
    (node.skills || []).forEach((skill) => {
      const item = document.createElement("li");
      item.textContent = skill;
      panel.skills.appendChild(item);
    });
    if (!node.skills || node.skills.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No skill listed";
      panel.skills.appendChild(item);
    }

    panel.links.innerHTML = "";
    (node.links || []).forEach((link) => {
      const item = document.createElement("li");
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.textContent = link.label;
      if (/^https?:\/\//.test(link.url)) {
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
      }
      item.appendChild(anchor);
      panel.links.appendChild(item);
    });
    if (!node.links || node.links.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No external link";
      panel.links.appendChild(item);
    }
  }

  function nodeMatches(node) {
    const matchesFilter = currentFilter === "All" || node.category === currentFilter;
    const text = `${node.label} ${node.description || ""} ${(node.skills || []).join(" ")}`.toLowerCase();
    const matchesSearch = !currentSearch || text.includes(currentSearch);
    return matchesFilter && matchesSearch;
  }

  function applyVisibility() {
    if (!graphData) return;
    const visibleIds = new Set(graphData.nodes.filter(nodeMatches).map((node) => node.id));

    nodeSelection
      .classed("is-muted", (node) => !visibleIds.has(node.id))
      .classed("is-search-match", (node) => Boolean(currentSearch) && visibleIds.has(node.id));

    labelSelection.classed("is-muted", (node) => !visibleIds.has(node.id));

    linkSelection.classed("is-muted", (link) => {
      const sourceId = typeof link.source === "object" ? link.source.id : link.source;
      const targetId = typeof link.target === "object" ? link.target.id : link.target;
      return !visibleIds.has(sourceId) || !visibleIds.has(targetId);
    });
  }

  function connectedIdsFor(node) {
    const ids = new Set([node.id]);
    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === "object" ? link.source.id : link.source;
      const targetId = typeof link.target === "object" ? link.target.id : link.target;
      if (sourceId === node.id) ids.add(targetId);
      if (targetId === node.id) ids.add(sourceId);
    });
    return ids;
  }

  function highlight(node) {
    const ids = connectedIdsFor(node);
    nodeSelection.classed("is-related", (item) => ids.has(item.id)).classed("is-dimmed", (item) => !ids.has(item.id));
    labelSelection.classed("is-related", (item) => ids.has(item.id)).classed("is-dimmed", (item) => !ids.has(item.id));
    linkSelection.classed("is-related", (link) => ids.has(link.source.id) && ids.has(link.target.id));
  }

  function clearHighlight() {
    nodeSelection.classed("is-related", false).classed("is-dimmed", false);
    labelSelection.classed("is-related", false).classed("is-dimmed", false);
    linkSelection.classed("is-related", false);
  }

  function resetView() {
    const { width, height } = getDimensions();
    svg
      .transition()
      .duration(600)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.86));
    simulation.alpha(0.45).restart();
  }

  function render(data) {
    graphData = {
      nodes: data.nodes.map((node) => ({ ...node })),
      links: data.links.map((link) => ({ ...link }))
    };

    const { width, height } = getDimensions();
    svg.attr("viewBox", [0, 0, width, height]);
    svg.selectAll("*").remove();
    container = svg.append("g");

    const linkLayer = container.append("g").attr("class", "links");
    const nodeLayer = container.append("g").attr("class", "nodes");
    const labelLayer = container.append("g").attr("class", "labels");

    linkSelection = linkLayer
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("class", "graph-link");

    nodeSelection = nodeLayer
      .selectAll("circle")
      .data(graphData.nodes)
      .join("circle")
      .attr("class", "graph-node")
      .attr("r", radiusFor)
      .attr("fill", (node) => colors[node.category] || colors.Skill)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (node) => `Open details for ${node.label}`)
      .on("mouseenter focus", function (_event, node) {
        d3.select(this).raise();
        highlight(node);
      })
      .on("mouseleave blur", clearHighlight)
      .on("click keydown", function (event, node) {
        if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        updatePanel(node);
        highlight(node);
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
            if (node.type !== "center") {
              node.fx = null;
              node.fy = null;
            }
          })
      );

    labelSelection = labelLayer
      .selectAll("text")
      .data(graphData.nodes)
      .join("text")
      .attr("class", "graph-label")
      .attr("text-anchor", "middle")
      .attr("dy", (node) => radiusFor(node) + 14)
      .text((node) => node.label);

    const centerNode = graphData.nodes.find((node) => node.type === "center");
    if (centerNode) {
      centerNode.fx = 0;
      centerNode.fy = 0;
      updatePanel(centerNode);
    }

    simulation = d3
      .forceSimulation(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink(graphData.links)
          .id((node) => node.id)
          .distance(linkDistance)
          .strength(0.52)
      )
      .force("charge", d3.forceManyBody().strength((node) => (node.type === "center" ? -780 : -340)))
      .force("center", d3.forceCenter(0, 0))
      .force("collide", d3.forceCollide().radius((node) => radiusFor(node) + 18).iterations(2))
      .force("x", d3.forceX(0).strength(0.045))
      .force("y", d3.forceY(0).strength(0.045))
      .on("tick", () => {
        linkSelection
          .attr("x1", (link) => link.source.x)
          .attr("y1", (link) => link.source.y)
          .attr("x2", (link) => link.target.x)
          .attr("y2", (link) => link.target.y);

        nodeSelection.attr("cx", (node) => node.x).attr("cy", (node) => node.y);
        labelSelection.attr("x", (node) => node.x).attr("y", (node) => node.y);
      });

    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.35, 2.8])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);
    resetView();
    applyVisibility();
    status.hidden = true;
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      applyVisibility();
    });
  });

  searchInput.addEventListener("input", (event) => {
    currentSearch = event.target.value.trim().toLowerCase();
    applyVisibility();
  });

  resetButton.addEventListener("click", resetView);

  window.addEventListener("resize", () => {
    if (!graphData) return;
    const { width, height } = getDimensions();
    svg.attr("viewBox", [0, 0, width, height]);
  });

  d3.json("data/graph.json")
    .then(render)
    .catch((error) => {
      console.error("Could not load graph data:", error);
      status.hidden = false;
      status.textContent = "The graph data could not be loaded. Run a local server or check data/graph.json.";
    });
})();
