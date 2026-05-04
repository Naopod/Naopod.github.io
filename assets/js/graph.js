(function () {
  const container = document.querySelector("#knowledge-graph");
  const status = document.querySelector("#graph-status");
  const backButton = document.querySelector("#back-button");
  const infoPanel = document.querySelector("#node-info");
  const infoClose = document.querySelector("#info-close");
  const infoCategory = document.querySelector("#info-category");
  const infoTitle = document.querySelector("#info-title");
  const infoDescription = document.querySelector("#info-description");
  const infoDetails = document.querySelector("#info-details");

  const colors = {
    Center: 0x76ebff,
    Projects: 0xffb86c,
    Research: 0xcaa8ff,
    Experience: 0x88ffbd,
    Education: 0x75a7ff
  };

  const planetPalettes = [
    [0x5aa9ff, 0xd7f3ff, 0x1b3f73],
    [0xffb86c, 0xffe0a3, 0x7a3420],
    [0x88ffbd, 0xd8ffe9, 0x1d5c48],
    [0xcaa8ff, 0xf1dcff, 0x47306f],
    [0xff79cf, 0xffd1ef, 0x6e245b],
    [0x75a7ff, 0xcbdcff, 0x23396d],
    [0xe7d7a5, 0xfff5cf, 0x6b5732],
    [0x7af7ff, 0xe3feff, 0x1a5862]
  ];

  let dataset = null;
  let currentView = "home";
  let scene = null;
  let camera = null;
  let renderer = null;
  let graphGroup = null;
  let raycaster = null;
  let pointer = null;
  let hoveredPlanet = null;
  let planetRecords = [];
  let linkRecords = [];
  let orbitRecords = [];
  let timelineRecords = [];
  let clickablePlanets = [];
  let isDragging = false;
  let dragDistance = 0;
  let isTransitioning = false;
  let flyAnimation = null;
  let bigBang = null;
  let focusedRecord = null;
  let viewHistory = [];
  let previousPointer = { x: 0, y: 0 };
  let targetRotation = { x: -0.2, y: 0.22 };
  let currentRotation = { x: -0.2, y: 0.22 };

  function closeInfo() {
    infoPanel.hidden = true;
  }

  function updateBackButton() {
    backButton.hidden = currentView === "home" && viewHistory.length === 0 && !focusedRecord;
  }

  function showInfo(node) {
    infoCategory.textContent = node.category || "Node";
    infoTitle.textContent = node.label;
    infoDescription.textContent = node.description || "";
    infoDetails.innerHTML = "";

    (node.details || []).forEach((detail) => {
      const item = document.createElement("li");
      item.textContent = detail;
      infoDetails.appendChild(item);
    });

    infoPanel.hidden = false;
    updateBackButton();
  }

  function buildView(viewName) {
    const view = dataset.views[viewName] || dataset.views.home;
    return {
      center: { ...view.center, isCenter: true },
      nodes: view.nodes.map((node) => ({ ...node, isCenter: false })),
      links: view.links.map((link) => ({ ...link }))
    };
  }

  function colorFor(node) {
    return colors[node.category] || colors.Center;
  }

  function hashString(value) {
    return value.split("").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  }

  function paletteFor(node) {
    if (node.isCenter) {
      return [colorFor(node), 0xffffff, 0xff8a2a];
    }
    return planetPalettes[hashString(node.id) % planetPalettes.length];
  }

  function disposeObject(object) {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      } else {
        if (object.material.map) object.material.map.dispose();
        object.material.dispose();
      }
    }
  }

  function makeGlowTexture(color, innerAlpha) {
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, ${innerAlpha})`);
    gradient.addColorStop(0.28, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.32)`);
    gradient.addColorStop(1, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  function makePlanetTexture(baseColor, accentColor, shadowColor, isCenter, seed) {
    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const accent = new THREE.Color(accentColor);
    const shadow = new THREE.Color(shadowColor);
    const base = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);

    if (isCenter) {
      const core = context.createRadialGradient(size * 0.45, size * 0.45, 0, size / 2, size / 2, size * 0.72);
      core.addColorStop(0, "rgba(255,255,230,0.95)");
      core.addColorStop(0.26, `rgba(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255},0.92)`);
      core.addColorStop(1, "rgba(255,80,20,0.25)");
      context.fillStyle = core;
      context.fillRect(0, 0, size, size);
      context.globalCompositeOperation = "lighter";
      for (let i = 0; i < 80; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const radius = size * (0.025 + Math.random() * 0.08);
        const cell = context.createRadialGradient(x, y, 0, x, y, radius);
        cell.addColorStop(0, `rgba(255,255,220,${0.16 + Math.random() * 0.18})`);
        cell.addColorStop(0.45, `rgba(${accent.r * 255}, ${accent.g * 255}, ${accent.b * 255}, 0.08)`);
        cell.addColorStop(1, "rgba(255,90,20,0)");
        context.fillStyle = cell;
        context.fillRect(0, 0, size, size);
      }
      for (let i = 0; i < 160; i += 1) {
        const y = (i / 160) * size;
        const wave = Math.sin(i * 0.35 + seed) * 32;
        context.strokeStyle = `rgba(${accent.r * 255}, ${accent.g * 255}, ${accent.b * 255}, ${0.06 + Math.random() * 0.1})`;
        context.lineWidth = 1 + Math.random() * 4;
        context.beginPath();
        context.moveTo(0, y);
        context.bezierCurveTo(size * 0.25, y + wave, size * 0.75, y - wave, size, y + Math.sin(i) * 18);
        context.stroke();
      }
      for (let i = 0; i < 38; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        context.strokeStyle = `rgba(255,245,190,${0.08 + Math.random() * 0.14})`;
        context.lineWidth = 1 + Math.random() * 5;
        context.beginPath();
        context.moveTo(x, y);
        context.bezierCurveTo(
          x + (Math.random() - 0.5) * 180,
          y + (Math.random() - 0.5) * 90,
          x + (Math.random() - 0.5) * 220,
          y + (Math.random() - 0.5) * 150,
          x + (Math.random() - 0.5) * 260,
          y + (Math.random() - 0.5) * 180
        );
        context.stroke();
      }
      context.globalCompositeOperation = "source-over";
    } else {
      for (let i = 0; i < 95; i += 1) {
        const y = (i / 95) * size;
        const alpha = 0.035 + Math.random() * 0.09;
        context.fillStyle = i % 2 === 0
          ? `rgba(${accent.r * 255}, ${accent.g * 255}, ${accent.b * 255}, ${alpha})`
          : `rgba(${shadow.r * 255}, ${shadow.g * 255}, ${shadow.b * 255}, ${alpha})`;
        context.fillRect(0, y, size, 2 + Math.random() * 8);
      }
      for (let i = 0; i < 18; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const radiusX = 18 + Math.random() * 58;
        const radiusY = 7 + Math.random() * 18;
        context.save();
        context.translate(x, y);
        context.rotate((Math.random() - 0.5) * 0.6);
        const storm = context.createRadialGradient(0, 0, 0, 0, 0, radiusX);
        storm.addColorStop(0, `rgba(${accent.r * 255}, ${accent.g * 255}, ${accent.b * 255}, 0.16)`);
        storm.addColorStop(0.5, `rgba(${shadow.r * 255}, ${shadow.g * 255}, ${shadow.b * 255}, 0.08)`);
        storm.addColorStop(1, "rgba(0,0,0,0)");
        context.scale(1, radiusY / radiusX);
        context.fillStyle = storm;
        context.beginPath();
        context.arc(0, 0, radiusX, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      context.globalCompositeOperation = "overlay";
      for (let i = 0; i < 1100; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const radius = 1 + Math.random() * 5;
        context.fillStyle = Math.random() > 0.5
          ? `rgba(${accent.r * 255}, ${accent.g * 255}, ${accent.b * 255}, 0.08)`
          : `rgba(${shadow.r * 255}, ${shadow.g * 255}, ${shadow.b * 255}, 0.1)`;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalCompositeOperation = "source-over";
      for (let i = 0; i < 34; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const radius = 2 + Math.random() * 14;
        context.strokeStyle = `rgba(${shadow.r * 255}, ${shadow.g * 255}, ${shadow.b * 255}, ${0.07 + Math.random() * 0.08})`;
        context.lineWidth = 1 + Math.random() * 2;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.stroke();
      }
      const shade = context.createLinearGradient(0, 0, size, size);
      shade.addColorStop(0, "rgba(255,255,255,0.2)");
      shade.addColorStop(0.45, "rgba(255,255,255,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.32)");
      context.fillStyle = shade;
      context.fillRect(0, 0, size, size);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  function makeCloudTexture(colorHex, seed) {
    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const color = new THREE.Color(colorHex);
    context.clearRect(0, 0, size, size);
    for (let i = 0; i < 90; i += 1) {
      const y = ((i * 37 + seed * 19) % size);
      const alpha = 0.018 + Math.random() * 0.045;
      context.strokeStyle = `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, ${alpha})`;
      context.lineWidth = 2 + Math.random() * 10;
      context.beginPath();
      context.moveTo(-20, y);
      context.bezierCurveTo(size * 0.28, y + Math.sin(i + seed) * 34, size * 0.7, y - Math.cos(i) * 28, size + 20, y + Math.sin(i * 0.6) * 22);
      context.stroke();
    }
    for (let i = 0; i < 120; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 10 + Math.random() * 42;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${0.025 + Math.random() * 0.04})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  function makeRingTexture(baseColor, accentColor) {
    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const center = size / 2;
    const base = new THREE.Color(baseColor);
    const accent = new THREE.Color(accentColor);
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - center;
        const dy = y - center;
        const distance = Math.sqrt(dx * dx + dy * dy) / center;
        const band = Math.sin(distance * 80) * 0.5 + 0.5;
        const alpha = distance > 0.48 && distance < 0.98 ? (0.18 + band * 0.45) * (1 - Math.abs(distance - 0.73) * 1.2) : 0;
        const mix = base.clone().lerp(accent, band * 0.65);
        const offset = (y * size + x) * 4;
        image.data[offset] = mix.r * 255;
        image.data[offset + 1] = mix.g * 255;
        image.data[offset + 2] = mix.b * 255;
        image.data[offset + 3] = Math.max(0, Math.min(255, alpha * 255));
      }
    }
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function createCosmicWebHub(node, orbit) {
    const color = new THREE.Color(colorFor(node));
    const group = new THREE.Group();
    const strandCount = 34;
    const pointsPerStrand = 24;
    const pointCount = strandCount * pointsPerStrand;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pointCount * 3);
    const colorsArray = new Float32Array(pointCount * 3);
    const lineGroup = new THREE.Group();
    const accentColors = [
      color,
      new THREE.Color(0xff79cf),
      new THREE.Color(0xcaa8ff),
      new THREE.Color(0xffb86c),
      new THREE.Color(0x88ffbd)
    ];

    for (let strand = 0; strand < strandCount; strand += 1) {
      const theta = Math.random() * Math.PI * 2;
      const length = 2.4 + Math.random() * 4.6;
      const curl = (Math.random() - 0.5) * 1.3;
      const yDrift = (Math.random() - 0.5) * 2.2;
      const strandColor = accentColors[strand % accentColors.length];
      const linePoints = [];

      for (let step = 0; step < pointsPerStrand; step += 1) {
        const t = step / (pointsPerStrand - 1);
        const radius = Math.pow(t, 0.72) * length;
        const angle = theta + curl * t + Math.sin(t * Math.PI * 2 + strand) * 0.16;
        const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 0.12;
        const y = yDrift * t + Math.sin(t * Math.PI + strand) * 0.32;
        const z = Math.sin(angle * 1.8 + strand) * (0.32 + t * 0.85);
        const index = (strand * pointsPerStrand + step) * 3;
        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;
        const mixed = color.clone().lerp(strandColor, 0.35 + t * 0.5);
        colorsArray[index] = mixed.r;
        colorsArray[index + 1] = mixed.g;
        colorsArray[index + 2] = mixed.b;
        if (step % 3 === 0) linePoints.push(new THREE.Vector3(x, y, z));
      }

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePoints),
        new THREE.LineBasicMaterial({
          color: strandColor,
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      lineGroup.add(line);
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
    const particles = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    particles.userData.node = node;
    group.add(lineGroup, particles);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(color, 0.26),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.46
    }));
    glow.scale.set(7.4, 7.4, 1);
    glow.userData.baseScale = glow.scale.clone();
    group.add(glow);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(2.75, 32, 32),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.userData.node = node;
    hit.userData.baseEmissive = 0;
    group.add(hit);

    const label = createLabel("", true);
    label.material.opacity = 0;
    label.userData.baseScale = label.scale.clone();
    group.add(label);

    const record = {
      node,
      sphere: hit,
      glow,
      label,
      orbit,
      hidden: false,
      galaxy: group,
      cosmicWeb: true,
      hideLabel: true,
      particles,
      webLines: lineGroup
    };
    setRecordPosition(record, new THREE.Vector3(0, 0, 0));
    graphGroup.add(group);
    planetRecords.push(record);
    return record;
  }

  function createGalaxyNode(node, orbit) {
    if (node.isCenter) return createCosmicWebHub(node, orbit);

    const color = new THREE.Color(colorFor(node));
    const hash = hashString(node.id);
    const group = new THREE.Group();
    const count = 1120;
    const radius = 1.85;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colorsArray = new Float32Array(count * 3);
    const accent = color.clone().lerp(new THREE.Color(0xffffff), 0.45);
    const warmCore = color.clone().lerp(new THREE.Color(0xfff0c8), 0.58);
    const branches = 2 + (hash % 3);

    for (let i = 0; i < count; i += 1) {
      const branch = i % branches;
      const coreBias = Math.random() < 0.22;
      const distance = coreBias ? Math.pow(Math.random(), 2.8) * radius * 0.34 : Math.pow(Math.random(), 1.46) * radius;
      const spin = distance * (2.05 + (hash % 7) * 0.1);
      const angle = branch * ((Math.PI * 2) / branches) + spin + (Math.random() - 0.5) * (coreBias ? 1.5 : 0.36);
      positions[i * 3] = Math.cos(angle) * distance;
      positions[i * 3 + 1] = (Math.random() - 0.5) * radius * (coreBias ? 0.26 : 0.13);
      positions[i * 3 + 2] = Math.sin(angle) * distance * (0.32 + (hash % 4) * 0.035);
      const mixed = (coreBias ? warmCore : color).clone().lerp(accent, Math.min(1, distance / radius));
      colorsArray[i * 3] = mixed.r;
      colorsArray[i * 3 + 1] = mixed.g;
      colorsArray[i * 3 + 2] = mixed.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
    const material = new THREE.PointsMaterial({
      size: 0.075,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(geometry, material);
    particles.userData.node = node;
    particles.userData.baseEmissive = 0;
    group.add(particles);

    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(warmCore, 0.86),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.86
    }));
    core.scale.set(1.8, 1.8, 1);
    core.userData.baseScale = core.scale.clone();
    group.add(core);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(color, 0.36),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    const glowScale = 5.4;
    glow.scale.set(glowScale, glowScale, 1);
    glow.userData.baseScale = glow.scale.clone();
    group.add(glow);

    const dustRing = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.48, radius * 1.28, 128),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    dustRing.scale.y = 0.42;
    dustRing.rotation.x = 0.28 + (hash % 10) * 0.018;
    dustRing.rotation.z = (hash % 40) * 0.03;
    group.add(dustRing);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 32, 32),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.userData.node = node;
    hit.userData.baseEmissive = 0;
    group.add(hit);

    const label = createLabel(node.label, node.isCenter);
    group.add(label);

    const record = {
      node,
      sphere: hit,
      glow,
      label,
      orbit,
      hidden: false,
      galaxy: group,
      particles,
      core,
      dustRing
    };
    const position = node.isCenter ? new THREE.Vector3(0, 0, 0) : orbitPosition(orbit);
    setRecordPosition(record, position);
    graphGroup.add(group);
    planetRecords.push(record);
    clickablePlanets.push(hit);
    return record;
  }

  function createBigBangEffect() {
    const particleCount = 2600;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const directions = new Float32Array(particleCount * 3);
    const colorsArray = new Float32Array(particleCount * 3);
    const palette = [
      new THREE.Color(0x76ebff),
      new THREE.Color(0xff79cf),
      new THREE.Color(0xffb86c),
      new THREE.Color(0xcaa8ff),
      new THREE.Color(0xffffff)
    ];

    for (let i = 0; i < particleCount; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 4 + Math.pow(Math.random(), 0.42) * 30;
      const direction = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi) * 0.5
      ).normalize();
      directions[i * 3] = direction.x * speed;
      directions[i * 3 + 1] = direction.y * speed;
      directions[i * 3 + 2] = direction.z * speed;
      const color = palette[Math.floor(Math.random() * palette.length)];
      colorsArray[i * 3] = color.r;
      colorsArray[i * 3 + 1] = color.g;
      colorsArray[i * 3 + 2] = color.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
    const particles = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.105,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    scene.add(particles);

    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(new THREE.Color(0xffffff), 1),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    flash.scale.set(0.2, 0.2, 1);
    scene.add(flash);

    const shockwaves = [0x76ebff, 0xff79cf, 0xffb86c].map((hex, index) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.72 + index * 0.24, 0.76 + index * 0.24, 192),
        new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      ring.rotation.z = index * 0.7;
      scene.add(ring);
      return ring;
    });

    return {
      particles,
      flash,
      shockwaves,
      directions,
      start: performance.now(),
      duration: 2550
    };
  }

  function makeNebulaTexture(stops, seedHue) {
    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach((stop) => gradient.addColorStop(stop[0], stop[1]));
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = "lighter";
    for (let cloud = 0; cloud < 18; cloud += 1) {
      const x = size * (0.2 + Math.random() * 0.6);
      const y = size * (0.2 + Math.random() * 0.6);
      const radius = size * (0.08 + Math.random() * 0.18);
      const cloudGradient = context.createRadialGradient(x, y, 0, x, y, radius);
      cloudGradient.addColorStop(0, `hsla(${seedHue + Math.random() * 55}, 95%, 70%, ${0.08 + Math.random() * 0.1})`);
      cloudGradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = cloudGradient;
      context.fillRect(0, 0, size, size);
    }
    context.globalCompositeOperation = "source-over";
    for (let i = 0; i < 2600; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const alpha = Math.random() * 0.055;
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      context.fillRect(x, y, Math.random() > 0.96 ? 2 : 1, 1);
    }
    return new THREE.CanvasTexture(canvas);
  }

  function makeLabelTexture(text, isCenter) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const fontSize = isCenter ? 40 : 24;
    const font = `700 ${fontSize}px Inter, Segoe UI, sans-serif`;
    context.font = font;
    const metrics = context.measureText(text);
    const width = Math.ceil(metrics.width + 56);
    const height = isCenter ? 78 : 58;
    canvas.width = width;
    canvas.height = height;
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "rgba(118, 235, 255, 0.9)";
    context.shadowBlur = isCenter ? 14 : 8;
    context.fillStyle = "rgba(234, 252, 255, 0.92)";
    context.fillText(text, width / 2, height / 2);
    return new THREE.CanvasTexture(canvas);
  }

  function createLabel(text, isCenter) {
    const texture = makeLabelTexture(text, isCenter);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    const scale = isCenter ? 2.55 : 1.55;
    sprite.scale.set((texture.image.width / texture.image.height) * scale, scale, 1);
    sprite.userData.baseScale = sprite.scale.clone();
    return sprite;
  }

  function orbitPosition(orbit) {
    const x = Math.cos(orbit.angle) * orbit.a;
    const y = Math.sin(orbit.angle) * orbit.b;
    const z = Math.sin(orbit.angle + orbit.phase) * orbit.depth;
    const position = new THREE.Vector3(x, y, z);
    position.applyEuler(new THREE.Euler(orbit.inclination, 0, orbit.tilt));
    return position;
  }

  function createOrbit(record) {
    const points = [];
    for (let i = 0; i <= 256; i += 1) {
      const angle = (i / 256) * Math.PI * 2;
      const point = new THREE.Vector3(
        Math.cos(angle) * record.orbit.a,
        Math.sin(angle) * record.orbit.b,
        Math.sin(angle + record.orbit.phase) * record.orbit.depth
      );
      point.applyEuler(new THREE.Euler(record.orbit.inclination, 0, record.orbit.tilt));
      points.push(point);
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: colorFor(record.node),
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending
    });
    const orbit = new THREE.LineLoop(geometry, material);
    graphGroup.add(orbit);
    orbitRecords.push(orbit);
  }

  function createPlanet(node, orbit) {
    const color = new THREE.Color(colorFor(node));
    const hash = hashString(node.id);
    const radius = node.isCenter ? 1.55 : 0.48 + Math.min(0.18, orbit.a * 0.012);
    const [baseHex, accentHex, shadowHex] = paletteFor(node);
    const baseColor = new THREE.Color(baseHex);
    const surfaceColor = node.isCenter ? color : baseColor;
    const material = new THREE.MeshStandardMaterial({
      color: surfaceColor,
      map: makePlanetTexture(surfaceColor, accentHex, shadowHex, node.isCenter, node.id.length),
      emissive: node.isCenter ? color : surfaceColor.clone().multiplyScalar(0.35),
      emissiveIntensity: node.isCenter ? 2.35 : 0.14,
      roughness: node.isCenter ? 0.22 : 0.74,
      metalness: node.isCenter ? 0.02 : 0.08
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), material);
    sphere.userData.node = node;
    sphere.userData.baseEmissive = material.emissiveIntensity;

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(color, node.isCenter ? 0.9 : 0.55),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    const glowScale = node.isCenter ? 9.7 : 2.1;
    glow.scale.set(glowScale, glowScale, 1);
    glow.userData.baseScale = glow.scale.clone();

    const label = createLabel(node.label, node.isCenter);
    if (node.id === "anthony-pierre") {
      label.scale.multiplyScalar(1.28);
      label.userData.baseScale = label.scale.clone();
    }
    const record = { node, sphere, glow, label, orbit, hidden: false };
    const position = node.isCenter ? new THREE.Vector3(0, 0, 0) : orbitPosition(orbit);
    setRecordPosition(record, position);

    graphGroup.add(glow, sphere, label);

    if (node.isCenter) {
      const corona = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(color, 0.74),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.88
      }));
      corona.scale.set(13.8, 13.8, 1);
      corona.userData.baseScale = corona.scale.clone();
      record.corona = corona;
      graphGroup.add(corona);

      const plasma = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.035, 64, 64),
        new THREE.MeshBasicMaterial({
          color,
          map: makeCloudTexture(accentHex, hash),
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      record.plasma = plasma;
      graphGroup.add(plasma);
    } else {
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.07, 48, 48),
        new THREE.MeshBasicMaterial({
          color: accentHex,
          map: makeCloudTexture(accentHex, hash),
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      record.atmosphere = atmosphere;
      graphGroup.add(atmosphere);

      const limb = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(color, 0.18),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.36
      }));
      limb.scale.set(2.15, 2.15, 1);
      limb.userData.baseScale = limb.scale.clone();
      record.limb = limb;
      graphGroup.add(limb);
    }

    if (!node.isCenter && hash % 3 === 0) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.46, radius * 2.05, 160),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: makeRingTexture(baseHex, accentHex),
          transparent: true,
          opacity: 0.68,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      ring.rotation.x = Math.PI * (0.53 + (hashString(node.id) % 12) / 100);
      ring.rotation.z = 0.22 + (hashString(node.id) % 20) / 50;
      record.ring = ring;
      graphGroup.add(ring);
    }

    if (!node.isCenter && hash % 4 !== 1) {
      const moonGroup = new THREE.Group();
      const moonCount = hash % 5 === 0 ? 2 : 1;
      const moons = [];
      for (let index = 0; index < moonCount; index += 1) {
        const moonRadius = radius * (0.13 + index * 0.035);
        const moonDistance = radius * (2.05 + index * 0.58);
        const moon = new THREE.Mesh(
          new THREE.SphereGeometry(moonRadius, 24, 24),
          new THREE.MeshStandardMaterial({
            color: index === 0 ? 0xd8d6ca : 0xaeb8c8,
            roughness: 0.92,
            metalness: 0.02,
            emissive: 0x1c2438,
            emissiveIntensity: 0.08
          })
        );
        moon.position.set(moonDistance, 0, 0);
        moon.userData.distance = moonDistance;
        moon.userData.speed = 0.012 + index * 0.006 + (hash % 7) * 0.0008;
        moon.userData.angle = (hash % 100) * 0.01 + index * Math.PI;
        moon.userData.inclination = 0.32 + index * 0.22;
        moonGroup.add(moon);
        moons.push(moon);

        const moonOrbit = new THREE.Mesh(
          new THREE.RingGeometry(moonDistance - 0.006, moonDistance + 0.006, 96),
          new THREE.MeshBasicMaterial({
            color: 0xbfdfff,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        );
        moonOrbit.rotation.x = Math.PI / 2 + moon.userData.inclination;
        moonGroup.add(moonOrbit);
      }
      record.moonGroup = moonGroup;
      record.moons = moons;
      graphGroup.add(moonGroup);
    }

    planetRecords.push(record);
    clickablePlanets.push(sphere);
    return record;
  }

  function setRecordPosition(record, position) {
    if (record.galaxy) {
      record.galaxy.position.copy(position);
      record.sphere.position.set(0, 0, 0);
      record.glow.position.set(0, 0, 0);
      record.label.position.set(0, record.node.id === "anthony-pierre" ? -3.15 : -1.95, 0);
      return;
    }
    record.sphere.position.copy(position);
    record.glow.position.copy(position);
    if (record.corona) record.corona.position.copy(position);
    if (record.plasma) record.plasma.position.copy(position);
    if (record.ring) record.ring.position.copy(position);
    if (record.atmosphere) record.atmosphere.position.copy(position);
    if (record.limb) record.limb.position.copy(position);
    if (record.moonGroup) record.moonGroup.position.copy(position);
    record.label.position.copy(position);
    record.label.position.y -= record.node.id === "anthony-pierre" ? 2.0 : record.node.isCenter ? 1.45 : 0.9;
  }

  function createLinks(links) {
    links.forEach((link) => {
      const source = planetRecords.find((record) => record.node.id === link.source);
      const target = planetRecords.find((record) => record.node.id === link.target);
      if (!source || !target) return;
      const geometry = new THREE.BufferGeometry();
      const subdivisions = currentView === "home" ? 18 : 1;
      const points = Array.from({ length: subdivisions + 1 }, () => new THREE.Vector3());
      geometry.setFromPoints(points);
      const color = currentView === "home" ? colorFor(target.node) : 0x76ebff;
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: currentView === "home" ? 0.34 : 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const line = new THREE.Line(geometry, material);
      graphGroup.add(line);
      linkRecords.push({
        line,
        source,
        target,
        subdivisions,
        phase: hashString(`${link.source}-${link.target}`) * 0.01,
        baseOpacity: currentView === "home" ? 0.34 : 0.24
      });
    });
  }

  function timelineSequenceFor(viewName) {
    if (viewName === "education") {
      return ["uca-licence-1-2", "upec-licence-3", "paris-dauphine-psl", "ecole-polytechnique"];
    }
    if (viewName === "experience") {
      return ["private-tutor", "mayane-labs", "quant-analyst-actuarial", "flood-risk-mission", "nexialog-rd-phd"];
    }
    return [];
  }

  function createTimelinePath(viewName) {
    const records = timelineSequenceFor(viewName)
      .map((id) => planetRecords.find((record) => record.node.id === id))
      .filter(Boolean);
    if (records.length < 2) return;

    for (let index = 0; index < records.length - 1; index += 1) {
      const source = records[index];
      const target = records[index + 1];
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
      const material = new THREE.LineDashedMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0.76,
        dashSize: 0.28,
        gapSize: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(90)), material);
      line.computeLineDistances();
      graphGroup.add(line);

      const marker = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(new THREE.Color(0xffd27a), 0.82),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.95
      }));
      marker.scale.set(0.62, 0.62, 1);
      graphGroup.add(marker);
      timelineRecords.push({ line, marker, curve, source, target, lift: 1.2 + index * 0.16, progress: index / records.length, speed: 0.004 + index * 0.0005 });
    }
  }

  function createStarField() {
    const createLayer = (count, minRadius, maxRadius, size, opacity) => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colorsArray = new Float32Array(count * 3);
      const palette = [
        new THREE.Color(0xbff8ff),
        new THREE.Color(0xf4d8ff),
        new THREE.Color(0xffd59f),
        new THREE.Color(0x8dffdc),
        new THREE.Color(0xff79cf),
        new THREE.Color(0xffffff)
      ];
      for (let index = 0; index < count; index += 1) {
        const radius = minRadius + Math.random() * (maxRadius - minRadius);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[index * 3 + 2] = radius * Math.cos(phi);
        const color = palette[Math.floor(Math.random() * palette.length)];
        colorsArray[index * 3] = color.r;
        colorsArray[index * 3 + 1] = color.g;
        colorsArray[index * 3 + 2] = color.b;
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
      const material = new THREE.PointsMaterial({
        size,
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      scene.add(new THREE.Points(geometry, material));
    };

    createLayer(1800, 42, 78, 0.045, 0.7);
    createLayer(3200, 78, 150, 0.055, 0.82);
    createLayer(2600, 150, 260, 0.075, 0.55);

    const brightGeometry = new THREE.BufferGeometry();
    const count = 90;
    const positions = new Float32Array(count * 3);
    const colorsArray = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = 85 + Math.random() * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[index * 3 + 2] = radius * Math.cos(phi);
      const color = new THREE.Color(Math.random() > 0.5 ? 0xffffff : 0xbff8ff);
      colorsArray[index * 3] = color.r;
      colorsArray[index * 3 + 1] = color.g;
      colorsArray[index * 3 + 2] = color.b;
    }
    brightGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    brightGeometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
    const material = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    scene.add(new THREE.Points(brightGeometry, material));
  }

  function createNebulae() {
    const nebulae = [
      { hue: 190, color: [[0, "rgba(118,235,255,0.58)"], [0.32, "rgba(40,120,255,0.34)"], [1, "rgba(0,0,0,0)"]], pos: [-28, 11, -48], scale: [44, 28, 1], rot: 0.2 },
      { hue: 305, color: [[0, "rgba(255,62,181,0.48)"], [0.38, "rgba(202,168,255,0.36)"], [1, "rgba(0,0,0,0)"]], pos: [28, -8, -54], scale: [48, 30, 1], rot: -0.45 },
      { hue: 32, color: [[0, "rgba(255,184,108,0.4)"], [0.44, "rgba(68,255,184,0.3)"], [1, "rgba(0,0,0,0)"]], pos: [3, 21, -62], scale: [52, 22, 1], rot: 0.65 },
      { hue: 165, color: [[0, "rgba(70,255,210,0.34)"], [0.36, "rgba(118,235,255,0.24)"], [1, "rgba(0,0,0,0)"]], pos: [-10, -18, -56], scale: [42, 24, 1], rot: -0.25 },
      { hue: 265, color: [[0, "rgba(122,95,255,0.32)"], [0.46, "rgba(255,79,216,0.24)"], [1, "rgba(0,0,0,0)"]], pos: [0, -2, -80], scale: [70, 38, 1], rot: 0.05 }
    ];
    nebulae.forEach((nebula) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeNebulaTexture(nebula.color, nebula.hue),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.92
      }));
      sprite.position.set(...nebula.pos);
      sprite.scale.set(...nebula.scale);
      sprite.material.rotation = nebula.rot;
      scene.add(sprite);
    });
  }

  function createGalaxy(position, radius, colorA, colorB) {
    const count = 1600;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colorsArray = new Float32Array(count * 3);
    const first = new THREE.Color(colorA);
    const second = new THREE.Color(colorB);
    for (let i = 0; i < count; i += 1) {
      const branch = i % 4;
      const distance = Math.pow(Math.random(), 1.8) * radius;
      const spin = distance * 0.5;
      const angle = branch * ((Math.PI * 2) / 4) + spin + (Math.random() - 0.5) * 0.42;
      positions[i * 3] = position[0] + Math.cos(angle) * distance;
      positions[i * 3 + 1] = position[1] + (Math.random() - 0.5) * 0.72;
      positions[i * 3 + 2] = position[2] + Math.sin(angle) * distance * 0.48;
      const mixed = first.clone().lerp(second, distance / radius);
      colorsArray[i * 3] = mixed.r;
      colorsArray[i * 3 + 1] = mixed.g;
      colorsArray[i * 3 + 2] = mixed.b;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
    const material = new THREE.PointsMaterial({
      size: 0.085,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const galaxy = new THREE.Points(geometry, material);
    galaxy.rotation.x = Math.PI * 0.16;
    scene.add(galaxy);
  }

  function clearGraph() {
    clickablePlanets = [];
    planetRecords = [];
    linkRecords = [];
    orbitRecords = [];
    timelineRecords = [];
    hoveredPlanet = null;
    if (graphGroup) {
      scene.remove(graphGroup);
      graphGroup.traverse(disposeObject);
    }
    graphGroup = new THREE.Group();
    graphGroup.scale.setScalar(0.001);
    graphGroup.rotation.x = currentRotation.x;
    graphGroup.rotation.y = currentRotation.y;
    scene.add(graphGroup);
  }

  function setRecordOpacity(record, opacity) {
    if (record.galaxy) {
      record.particles.material.transparent = true;
      record.particles.material.opacity = 0.92 * opacity;
      if (record.core) {
        record.core.material.transparent = true;
        record.core.material.opacity = 0.86 * opacity;
      }
      if (record.dustRing) {
        record.dustRing.material.transparent = true;
        record.dustRing.material.opacity = 0.16 * opacity;
      }
      if (record.webLines) {
        record.webLines.children.forEach((line) => {
          line.material.transparent = true;
          line.material.opacity = 0.18 * opacity;
        });
      }
      record.glow.material.transparent = true;
      record.glow.material.opacity = opacity;
      record.label.material.transparent = true;
      record.label.material.opacity = record.hideLabel ? 0 : opacity;
      record.sphere.material.transparent = true;
      record.sphere.material.opacity = 0;
      record.hidden = opacity === 0;
      return;
    }
    [record.sphere.material, record.glow.material, record.label.material].forEach((material) => {
      material.transparent = true;
      material.opacity = opacity;
    });
    if (record.corona) {
      record.corona.material.transparent = true;
      record.corona.material.opacity = 0.88 * opacity;
    }
    if (record.plasma) {
      record.plasma.material.transparent = true;
      record.plasma.material.opacity = 0.28 * opacity;
    }
    if (record.ring) {
      record.ring.material.transparent = true;
      record.ring.material.opacity = 0.28 * opacity;
    }
    if (record.atmosphere) {
      record.atmosphere.material.transparent = true;
      record.atmosphere.material.opacity = 0.18 * opacity;
    }
    if (record.limb) {
      record.limb.material.transparent = true;
      record.limb.material.opacity = 0.36 * opacity;
    }
    if (record.moonGroup) {
      record.moonGroup.traverse((object) => {
        if (!object.material) return;
        object.material.transparent = true;
        object.material.opacity = (object.type === "Mesh" && object.geometry.type === "RingGeometry" ? 0.12 : 1) * opacity;
      });
    }
    record.hidden = opacity === 0;
  }

  function setLineOpacity(line, opacity) {
    line.material.transparent = true;
    line.material.opacity = opacity;
  }

  function setOrbitOpacity(orbit, opacity) {
    orbit.material.transparent = true;
    orbit.material.opacity = opacity;
  }

  function setTimelineOpacity(record, opacity) {
    record.line.material.transparent = true;
    record.line.material.opacity = 0.76 * opacity;
    record.marker.material.transparent = true;
    record.marker.material.opacity = 0.95 * opacity;
  }

  function recordPosition(record) {
    return record.galaxy ? record.galaxy.position : record.sphere.position;
  }

  function renderView(viewName, withArrival, options = {}) {
    currentView = viewName;
    closeInfo();
    focusedRecord = null;
    clearGraph();
    if (withArrival) {
      camera.position.set(0, 1.6, 5.8);
      camera.lookAt(0, 0, 0);
    }

    const graph = buildView(viewName);
    const orbitBase = currentView === "home" ? 8.8 : 7.4;
    const createNodeObject = currentView === "home" ? createGalaxyNode : createPlanet;
    const centerRecord = createNodeObject(graph.center, { a: 0, b: 0, depth: 0, angle: 0, speed: 0, inclination: 0, tilt: 0, phase: 0 });
    setRecordOpacity(centerRecord, withArrival ? 0 : 1);

    graph.nodes.forEach((node, index) => {
      const count = Math.max(graph.nodes.length, 1);
      const lane = 1 + (index % 3) * 0.18;
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const orbit = {
        a: orbitBase * lane,
        b: orbitBase * (0.54 + (index % 2) * 0.1) * lane,
        depth: 0.9 + (index % 3) * 0.42,
        angle,
        speed: 0.0022 / Math.pow(lane + index * 0.08, 1.5),
        inclination: -0.18 + (index % 4) * 0.12,
        tilt: (index % 5) * 0.08,
        phase: index * 0.74
      };
      const record = createNodeObject(node, orbit);
      setRecordOpacity(record, withArrival ? 0 : 1);
      if (currentView !== "home") createOrbit(record);
    });

    // Relationships remain in data/graph.json; the 3D scene draws orbits plus explicit temporal paths.
    if (currentView === "home") createLinks(graph.links);
    createTimelinePath(currentView);
    linkRecords.forEach(({ line, baseOpacity }) => setLineOpacity(line, withArrival ? 0 : baseOpacity));
    orbitRecords.forEach((orbit) => setOrbitOpacity(orbit, withArrival ? 0 : 0.22));
    timelineRecords.forEach((record) => setTimelineOpacity(record, withArrival ? 0 : 1));
    graphGroup.scale.setScalar(withArrival ? 0.82 : 1);
    if (options.bigBangIntro) {
      document.body.classList.add("is-intro");
      camera.position.set(0, 1.6, 8);
      camera.lookAt(0, 0, 0);
      graphGroup.scale.setScalar(0.001);
      planetRecords.forEach((record) => setRecordOpacity(record, 0));
      linkRecords.forEach(({ line }) => setLineOpacity(line, 0));
      bigBang = createBigBangEffect();
      isTransitioning = true;
      updateBackButton();
      status.hidden = true;
      return;
    }
    if (withArrival) {
      isTransitioning = true;
      flyAnimation = {
        type: "arrival",
        start: performance.now(),
        duration: 1150,
        fromZ: 5.8,
        toZ: 18,
        revealStarted: false,
        onComplete: () => {
          isTransitioning = false;
          updateBackButton();
        }
      };
    }
    updateBackButton();
    status.hidden = true;
  }

  function animateOpacity(targetRecord, selectedOnly) {
    planetRecords.forEach((record) => {
      const opacity = !selectedOnly || record === targetRecord ? 1 : 0;
      setRecordOpacity(record, opacity);
    });
    if (selectedOnly) {
      targetRecord.label.material.opacity = 0;
      targetRecord.label.scale.setScalar(0.001);
    }
    linkRecords.forEach(({ line, baseOpacity }) => {
      setLineOpacity(line, selectedOnly ? 0 : baseOpacity || 0.24);
    });
    orbitRecords.forEach((orbit) => {
      setOrbitOpacity(orbit, selectedOnly ? 0 : 0.22);
    });
    timelineRecords.forEach((record) => {
      setTimelineOpacity(record, selectedOnly ? 0 : 1);
    });
  }

  function revealSystem(progress) {
    const eased = 1 - Math.pow(1 - progress, 3);
    planetRecords.forEach((record) => {
      setRecordOpacity(record, eased);
      record.sphere.scale.setScalar(0.62 + eased * 0.38);
      record.glow.scale.copy(record.glow.userData.baseScale).multiplyScalar(0.82 + eased * 0.18);
      if (record.corona) record.corona.scale.copy(record.corona.userData.baseScale).multiplyScalar(0.72 + eased * 0.28);
      if (record.plasma) record.plasma.scale.setScalar(0.78 + eased * 0.22);
      if (record.atmosphere) record.atmosphere.scale.setScalar(0.78 + eased * 0.22);
      if (record.limb) record.limb.scale.copy(record.limb.userData.baseScale).multiplyScalar(0.76 + eased * 0.24);
      if (record.ring) record.ring.scale.setScalar(0.72 + eased * 0.28);
      if (record.moonGroup) record.moonGroup.scale.setScalar(0.74 + eased * 0.26);
      if (!record.hideLabel) {
        record.label.scale.copy(record.label.userData.baseScale).multiplyScalar(0.72 + eased * 0.28);
        record.label.material.opacity = eased;
      }
      record.hidden = false;
    });
    linkRecords.forEach(({ line, baseOpacity }) => setLineOpacity(line, (baseOpacity || 0.24) * eased));
    orbitRecords.forEach((orbit) => setOrbitOpacity(orbit, 0.22 * eased));
    timelineRecords.forEach((record) => setTimelineOpacity(record, eased));
  }

  function restoreFocusedView() {
    if (!focusedRecord || isTransitioning) return false;
    closeInfo();
    isTransitioning = true;
    flyAnimation = {
      type: "restore",
      start: performance.now(),
      duration: 850,
      from: camera.position.clone(),
      to: new THREE.Vector3(0, 1.6, 18),
      fromScale: graphGroup.scale.x,
      toScale: 1,
      record: focusedRecord,
      onComplete: () => {
        if (focusedRecord) {
          delete focusedRecord.focusPosition;
          focusedRecord.label.material.opacity = 1;
          focusedRecord.label.scale.copy(focusedRecord.label.userData.baseScale);
        }
        focusedRecord = null;
        isTransitioning = false;
        updateBackButton();
      }
    };
    return true;
  }

  function flyToRecord(record, onComplete) {
    if (isTransitioning) return;
    const worldPosition = new THREE.Vector3();
    record.sphere.getWorldPosition(worldPosition);
    focusedRecord = record;
    record.focusPosition = record.galaxy ? record.galaxy.position.clone() : record.sphere.position.clone();
    const cameraOffset = record.node.isCenter ? new THREE.Vector3(0, 0.4, 3.4) : new THREE.Vector3(0.45, 0.2, 2.9);
    flyAnimation = {
      type: "focus",
      start: performance.now(),
      duration: 950,
      from: camera.position.clone(),
      to: worldPosition.clone().add(cameraOffset),
      lookAt: worldPosition,
      record,
      onComplete
    };
    isTransitioning = true;
  }

  function openNode(mesh) {
    const record = planetRecords.find((item) => item.sphere === mesh);
    if (!record) return;
    const node = record.node;
    if (node.view) {
      const previousView = currentView;
      flyToRecord(record, () => {
        focusedRecord = null;
        viewHistory.push(previousView);
        renderView(node.view, true);
      });
      return;
    }
    flyToRecord(record, () => {
      focusedRecord = record;
      animateOpacity(record, true);
      showInfo(node);
      isTransitioning = false;
      updateBackButton();
    });
  }

  function recordForMesh(mesh) {
    return planetRecords.find((item) => item.sphere === mesh);
  }

  function setHover(mesh) {
    if (hoveredPlanet === mesh) return;
    if (hoveredPlanet) {
      const previousRecord = recordForMesh(hoveredPlanet);
      if (previousRecord && previousRecord.galaxy) {
        previousRecord.galaxy.scale.setScalar(1);
        previousRecord.glow.scale.copy(previousRecord.glow.userData.baseScale);
      } else {
        hoveredPlanet.scale.setScalar(1);
        if ("emissiveIntensity" in hoveredPlanet.material) {
          hoveredPlanet.material.emissiveIntensity = hoveredPlanet.userData.baseEmissive;
        }
      }
    }
    hoveredPlanet = mesh;
    if (hoveredPlanet && !isTransitioning) {
      const nextRecord = recordForMesh(hoveredPlanet);
      if (nextRecord && nextRecord.galaxy) {
        nextRecord.galaxy.scale.setScalar(1.08);
        nextRecord.glow.scale.copy(nextRecord.glow.userData.baseScale).multiplyScalar(1.12);
      } else {
        hoveredPlanet.scale.setScalar(1.16);
        if ("emissiveIntensity" in hoveredPlanet.material) {
          hoveredPlanet.material.emissiveIntensity = hoveredPlanet.userData.baseEmissive + 0.5;
        }
      }
    }
    container.style.cursor = hoveredPlanet && !isTransitioning ? "pointer" : "grab";
  }

  function updatePointer(event) {
    const rect = container.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickPlanet(event) {
    if (isTransitioning) return null;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      clickablePlanets.filter((planet) => planet.visible && !recordForMesh(planet)?.hidden),
      false
    );
    return hits.length ? hits[0].object : null;
  }

  function initializeScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 160);
    camera.position.set(0, 1.6, 18);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    const ambient = new THREE.AmbientLight(0xb7f6ff, 0.52);
    const key = new THREE.PointLight(0x76ebff, 9, 70);
    key.position.set(0, 0, 5);
    const rim = new THREE.PointLight(0xcaa8ff, 4, 62);
    rim.position.set(-8, 5, 8);
    scene.add(ambient, key, rim);

    createNebulae();
    createGalaxy([-24, 12, -58], 7.4, 0x76ebff, 0xcaa8ff);
    createGalaxy([24, -10, -64], 8.2, 0xffb86c, 0x75a7ff);
    createGalaxy([4, 17, -72], 6.8, 0xff79cf, 0x8dffdc);
    createGalaxy([-4, -20, -88], 10.5, 0x44ffb8, 0xff79cf);
    createGalaxy([32, 14, -96], 5.6, 0xffffff, 0x76ebff);
    createStarField();
    graphGroup = new THREE.Group();
    scene.add(graphGroup);

    container.addEventListener("pointerdown", (event) => {
      if (isTransitioning) return;
      isDragging = true;
      dragDistance = 0;
      previousPointer = { x: event.clientX, y: event.clientY };
      container.setPointerCapture(event.pointerId);
    });

    container.addEventListener("pointermove", (event) => {
      if (isDragging && !isTransitioning) {
        const dx = event.clientX - previousPointer.x;
        const dy = event.clientY - previousPointer.y;
        dragDistance += Math.abs(dx) + Math.abs(dy);
        targetRotation.y += dx * 0.006;
        targetRotation.x += dy * 0.004;
        targetRotation.x = Math.max(-0.9, Math.min(0.7, targetRotation.x));
        previousPointer = { x: event.clientX, y: event.clientY };
        return;
      }
      setHover(pickPlanet(event));
    });

    container.addEventListener("pointerup", (event) => {
      isDragging = false;
      if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
    });

    container.addEventListener("click", (event) => {
      if (dragDistance > 8 || isTransitioning) return;
      const planet = pickPlanet(event);
      if (planet) openNode(planet);
    });

    container.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (isTransitioning) return;
      if (focusedRecord && event.deltaY > 0) {
        restoreFocusedView();
        return;
      }
      if (event.deltaY > 0 && currentView !== "home" && camera.position.z >= 29 && viewHistory.length > 0) {
        const previousView = viewHistory.pop();
        renderView(previousView, true);
        return;
      }
      camera.position.z = Math.max(8, Math.min(30, camera.position.z + event.deltaY * 0.012));
    }, { passive: false });

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function updatePlanets() {
    planetRecords.forEach((record) => {
      if (!record.node.isCenter && !record.hidden && !isTransitioning && record !== focusedRecord) {
        record.orbit.angle += record.orbit.speed;
      }
      const position = record.focusPosition || (record.node.isCenter ? new THREE.Vector3(0, 0, 0) : orbitPosition(record.orbit));
      setRecordPosition(record, position);
      if (record.galaxy) {
        record.particles.rotation.y += record.node.isCenter ? 0.0008 : 0.0014;
        record.particles.rotation.z += record.node.isCenter ? 0.00045 : 0.00075;
        if (record.core) record.core.material.rotation += 0.001;
        if (record.dustRing) record.dustRing.rotation.z += 0.0012;
      } else {
        record.sphere.rotation.y += record.node.isCenter ? 0.006 : 0.014;
        if (record.plasma) record.plasma.rotation.y -= 0.0035;
        if (record.atmosphere) record.atmosphere.rotation.y += 0.0048;
      }
      if (record.ring) record.ring.rotation.z += 0.0015;
      if (record.moons) {
        record.moons.forEach((moon) => {
          moon.userData.angle += moon.userData.speed;
          moon.position.set(
            Math.cos(moon.userData.angle) * moon.userData.distance,
            Math.sin(moon.userData.angle) * Math.sin(moon.userData.inclination) * moon.userData.distance * 0.32,
            Math.sin(moon.userData.angle) * Math.cos(moon.userData.inclination) * moon.userData.distance
          );
          moon.rotation.y += 0.01;
        });
      }
    });

    linkRecords.forEach(({ line, source, target, subdivisions, phase }) => {
      const start = recordPosition(source);
      const end = recordPosition(target);
      const position = line.geometry.attributes.position;
      const count = subdivisions || 1;
      for (let index = 0; index <= count; index += 1) {
        const t = index / count;
        const point = start.clone().lerp(end, t);
        if (count > 1) {
          const wave = Math.sin(t * Math.PI) * (0.28 + Math.sin(phase + performance.now() * 0.00055) * 0.05);
          point.y += wave * Math.sin(phase + t * Math.PI * 2);
          point.z += wave * Math.cos(phase + t * Math.PI * 2);
        }
        position.setXYZ(index, point.x, point.y, point.z);
      }
      position.needsUpdate = true;
    });
    timelineRecords.forEach((record) => {
      const start = record.source.sphere.position.clone();
      const end = record.target.sphere.position.clone();
      const control = start.clone().lerp(end, 0.5);
      control.y += record.lift;
      control.z += 0.75;
      record.curve.v0.copy(start);
      record.curve.v1.copy(control);
      record.curve.v2.copy(end);
      record.line.geometry.setFromPoints(record.curve.getPoints(90));
      record.line.computeLineDistances();
      record.progress = (record.progress + record.speed) % 1;
      record.marker.position.copy(record.curve.getPoint(record.progress));
    });
  }

  function updateFlyAnimation(now) {
    if (!flyAnimation) return;
    const progress = Math.min(1, (now - flyAnimation.start) / flyAnimation.duration);
    const eased = 1 - Math.pow(1 - progress, 3);

    if (flyAnimation.type === "focus") {
      camera.position.lerpVectors(flyAnimation.from, flyAnimation.to, eased);
      camera.lookAt(flyAnimation.lookAt);
      graphGroup.scale.setScalar(1 + eased * 0.07);
      if (!flyAnimation.record.node.view) {
        const labelFade = Math.max(0, 1 - progress / 0.58);
        flyAnimation.record.label.material.opacity = labelFade;
        flyAnimation.record.label.scale.copy(flyAnimation.record.label.userData.baseScale).multiplyScalar(Math.max(0.001, 1 - eased * 0.82));
      }
      if (progress >= 0.58) {
        planetRecords.forEach((record) => {
          if (record !== flyAnimation.record) {
            const opacity = Math.max(0, 1 - (progress - 0.58) / 0.42);
            setRecordOpacity(record, opacity);
          }
        });
        linkRecords.forEach(({ line, baseOpacity }) => {
          setLineOpacity(line, Math.max(0, (baseOpacity || 0.24) * (1 - (progress - 0.58) / 0.42)));
        });
        orbitRecords.forEach((orbit) => {
          setOrbitOpacity(orbit, Math.max(0, 0.22 * (1 - (progress - 0.58) / 0.42)));
        });
        timelineRecords.forEach((record) => {
          setTimelineOpacity(record, Math.max(0, 1 - (progress - 0.58) / 0.42));
        });
      }
    }

    if (flyAnimation.type === "arrival") {
      camera.position.z = flyAnimation.fromZ + (flyAnimation.toZ - flyAnimation.fromZ) * eased;
      camera.position.x = 0;
      camera.position.y = 1.6;
      camera.lookAt(0, 0, 0);
      graphGroup.scale.setScalar(0.82 + eased * 0.18);
      planetRecords.forEach((record, index) => {
        const delay = record.node.isCenter ? 0.08 : 0.24 + index * 0.11;
        const reveal = Math.max(0, Math.min(1, (progress - delay) / 0.32));
        const revealEase = 1 - Math.pow(1 - reveal, 3);
        setRecordOpacity(record, revealEase);
        if (record.galaxy) record.galaxy.scale.setScalar(0.82 + revealEase * 0.18);
        record.sphere.scale.setScalar(0.55 + revealEase * 0.45);
        record.glow.scale.copy(record.glow.userData.baseScale || record.glow.scale);
        if (record.corona) record.corona.scale.copy(record.corona.userData.baseScale).multiplyScalar(0.75 + revealEase * 0.25);
        if (record.plasma) record.plasma.scale.setScalar(0.75 + revealEase * 0.25);
        if (record.atmosphere) record.atmosphere.scale.setScalar(0.75 + revealEase * 0.25);
        if (record.limb) record.limb.scale.copy(record.limb.userData.baseScale).multiplyScalar(0.75 + revealEase * 0.25);
        if (record.ring) record.ring.scale.setScalar(0.72 + revealEase * 0.28);
        if (record.moonGroup) record.moonGroup.scale.setScalar(0.72 + revealEase * 0.28);
        if (!record.hideLabel) {
          record.label.scale.copy(record.label.userData.baseScale).multiplyScalar(0.72 + revealEase * 0.28);
        }
      });
      linkRecords.forEach(({ line, baseOpacity }, index) => {
        const reveal = Math.max(0, Math.min(1, (progress - 0.48 - index * 0.055) / 0.32));
        setLineOpacity(line, (baseOpacity || 0.24) * reveal);
      });
      orbitRecords.forEach((orbit, index) => {
        const reveal = Math.max(0, Math.min(1, (progress - 0.22 - index * 0.06) / 0.42));
        setOrbitOpacity(orbit, 0.22 * reveal);
      });
      timelineRecords.forEach((record, index) => {
        const reveal = Math.max(0, Math.min(1, (progress - 0.58 - index * 0.08) / 0.34));
        setTimelineOpacity(record, reveal);
      });
    }

    if (flyAnimation.type === "restore") {
      camera.position.lerpVectors(flyAnimation.from, flyAnimation.to, eased);
      camera.lookAt(0, 0, 0);
      graphGroup.scale.setScalar(flyAnimation.fromScale + (flyAnimation.toScale - flyAnimation.fromScale) * eased);
      revealSystem(progress);
    }

    if (progress >= 1) {
      const onComplete = flyAnimation.onComplete;
      flyAnimation = null;
      if (onComplete) onComplete();
    }
  }

  function updateBigBang(now) {
    if (!bigBang) return;
    const progress = Math.min(1, (now - bigBang.start) / bigBang.duration);
    const burst = Math.min(1, progress / 0.48);
    const reveal = Math.max(0, Math.min(1, (progress - 0.38) / 0.5));
    const revealEase = 1 - Math.pow(1 - reveal, 3);
    const fade = Math.max(0, 1 - Math.max(0, progress - 0.62) / 0.36);
    const flashIn = Math.min(1, progress / 0.08);
    const flashOut = Math.max(0, 1 - Math.max(0, progress - 0.06) / 0.42);
    const flashScale = 0.2 + Math.pow(burst, 0.64) * 19;

    camera.position.z = 6.8 + revealEase * 11.2;
    camera.position.y = 0.9 + revealEase * 0.7;
    camera.lookAt(0, 0, 0);
    graphGroup.scale.setScalar(0.04 + revealEase * 0.96);

    const positions = bigBang.particles.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const offset = i * 3;
      const turbulence = Math.sin(progress * 22 + i * 0.013) * (0.1 + burst * 0.26);
      const gravity = Math.pow(Math.max(0, progress - 0.44), 2) * 4.2;
      positions.setXYZ(
        i,
        bigBang.directions[offset] * burst + turbulence - bigBang.directions[offset] * gravity * 0.04,
        bigBang.directions[offset + 1] * burst + Math.cos(progress * 16 + i * 0.017) * 0.18 - bigBang.directions[offset + 1] * gravity * 0.035,
        bigBang.directions[offset + 2] * burst - bigBang.directions[offset + 2] * gravity * 0.03
      );
    }
    positions.needsUpdate = true;
    bigBang.particles.material.opacity = 0.95 * Math.sin(Math.PI * Math.min(1, burst)) * fade;
    bigBang.flash.material.opacity = flashIn * flashOut;
    bigBang.flash.scale.set(flashScale, flashScale, 1);
    bigBang.shockwaves.forEach((ring, index) => {
      const waveProgress = Math.max(0, Math.min(1, (progress - index * 0.055) / 0.56));
      const waveEase = 1 - Math.pow(1 - waveProgress, 3);
      const scale = 0.2 + waveEase * (13 + index * 3.2);
      ring.scale.set(scale, scale * (0.58 + index * 0.08), 1);
      ring.rotation.z += 0.002 + index * 0.0008;
      ring.material.opacity = Math.max(0, 0.42 * Math.sin(Math.PI * waveProgress) * (1 - progress * 0.45));
    });

    planetRecords.forEach((record, index) => {
      const delay = record.node.isCenter ? 0 : 0.08 + index * 0.055;
      const localReveal = Math.max(0, Math.min(1, (reveal - delay) / 0.58));
      const localEase = 1 - Math.pow(1 - localReveal, 3);
      setRecordOpacity(record, localEase);
      if (record.galaxy) record.galaxy.scale.setScalar(0.28 + localEase * 0.72);
      if (!record.hideLabel) {
        record.label.scale.copy(record.label.userData.baseScale).multiplyScalar(0.78 + localEase * 0.22);
      }
    });
    linkRecords.forEach(({ line, baseOpacity }, index) => {
      const localReveal = Math.max(0, Math.min(1, (reveal - 0.18 - index * 0.025) / 0.42));
      setLineOpacity(line, (baseOpacity || 0.24) * localReveal);
    });

    if (progress >= 1) {
      scene.remove(bigBang.particles, bigBang.flash, ...bigBang.shockwaves);
      disposeObject(bigBang.particles);
      disposeObject(bigBang.flash);
      bigBang.shockwaves.forEach(disposeObject);
      bigBang = null;
      graphGroup.scale.setScalar(1);
      planetRecords.forEach((record) => {
        setRecordOpacity(record, 1);
        if (record.galaxy) record.galaxy.scale.setScalar(1);
      });
      linkRecords.forEach(({ line, baseOpacity }) => setLineOpacity(line, baseOpacity || 0.24));
      document.body.classList.remove("is-intro");
      isTransitioning = false;
      updateBackButton();
    }
  }

  function animate(now) {
    requestAnimationFrame(animate);
    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.08;
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.08;
    if (!isDragging && !isTransitioning && !focusedRecord && graphGroup) targetRotation.y += 0.00055;
    if (graphGroup && !isTransitioning && !focusedRecord) {
      graphGroup.rotation.x = currentRotation.x;
      graphGroup.rotation.y = currentRotation.y;
    }
    updatePlanets();
    updateBigBang(now);
    updateFlyAnimation(now);
    renderer.render(scene, camera);
  }

  backButton.addEventListener("click", () => {
    if (restoreFocusedView()) return;
    closeInfo();
    const previousView = viewHistory.pop() || "home";
    renderView(previousView, true);
  });
  infoClose.addEventListener("click", () => {
    if (restoreFocusedView()) return;
    closeInfo();
    updateBackButton();
  });

  fetch("data/graph.json")
    .then((response) => {
      if (!response.ok) throw new Error("Graph data request failed.");
      return response.json();
    })
    .then((loaded) => {
      dataset = loaded;
      initializeScene();
      renderView("home", false, { bigBangIntro: true });
      animate();
    })
    .catch((error) => {
      console.error("Could not load graph data:", error);
      status.hidden = false;
      status.textContent = "Graph data could not be loaded.";
    });
})();
