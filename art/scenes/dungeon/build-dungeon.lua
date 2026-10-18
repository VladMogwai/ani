-- Builds an isometric pixel-art dungeon in Aseprite, one layer per kind of thing so it can be repainted by hand.
-- Run: aseprite -b --script-param out=dungeon.aseprite --script build-dungeon.lua

local CONFIG = {
  tileW = 64, tileH = 32, -- 2:1 diamond
  levelPx = 16,           -- pixels per height level
  margin = 40,
  seed = 7,
  -- heights per cell, rows go from the far edge to the viewer; A = 10, w = flooded pit, m = mossy block in the pit
  map = {
    "AAAAAAAAAAAAAAAA",
    "A666666666444444",
    "A666666666544444",
    "A666666666444444",
    "A222222522223222",
    "A222222422222222",
    "A222222322222222",
    "A222222222222222",
    "A222222222wwww22",
    "8222222222wmww22",
    "6222222222wwww22",
    "4222222222222222",
    "2222222222222222",
    "2222222222222222",
  },
  waterLevel = 1.3,
  -- wall cells that get a torch: "front" = the face looking down-left (+z), "side" = the face looking down-right (+x).
  -- The face must be visible, i.e. the neighbour in front of it is lower (checked below).
  torches = { { 4, 1, "front" }, { 9, 1, "front" }, { 14, 1, "front" }, { 1, 6, "side" } },
  -- big accent props (cells must match PROPS in src/animations/011-iso-tactics/level.ts, they block movement)
  props = {
    tree = { 4, 3 },     -- dead tree with roots, on the upper terrace
    column = { 3, 10 },  -- broken column
    rubble = { 12, 7 },  -- heap of stones by the right wall
    chains = { 6, 1 },   -- chains hanging on the front face of this wall cell
    bones = { { 4, 11 }, { 9, 12 }, { 7, 3 }, { 15, 11 } },
  },
  grassChance = 0.3,
  rubbleChance = 0.35,
  crackChance = 0.3, -- per floor slab
  dirt = 0.62,       -- threshold of the low-frequency noise above which the floor gets ochre dirt
  colors = {
    bg = "#121416",
    top = { "#4e5458", "#5b6165", "#686e72", "#757b7f", "#8a9094" }, -- deep, dark, base, light, rim
    cliffTop = { "#222528", "#2a2e31", "#33373a", "#3b3f42" },
    left = { "#383d41", "#43484c", "#4e5357", "#5a5f63" },  -- face looking down-left
    right = { "#272b2e", "#303437", "#393d41", "#43474b" }, -- face looking down-right, in shade
    crevice = "#1c1f22",
    dirt = { "#4f4836", "#5e5640", "#6f654a", "#7f7454" },
    water = { "#0c1e22", "#122a30", "#1a3940", "#2c5862" },
    moss = { "#344029", "#3e4a31", "#4c5a3c", "#5d6e46" },
    grass = { "#4f4528", "#665a32", "#7d6a37", "#94804a", "#a8925a" },
    torch = { "#221e1b", "#ff8a2c", "#ffc35a", "#fff1bd" },
    light = "#ff9a3c",
    bark = { "#211a14", "#382c22", "#574436" },
    iron = { "#16181a", "#5a5f64", "#a2a8ae" },
    bone = { "#3a332b", "#a69c86", "#d8cfb8" },
    edge = "#1f2020", -- the page panel colour the picture fades into
  },
}

---------------------------------------------------------------------------------------------------------------
local W, H = #CONFIG.map[1], #CONFIG.map
local TW, TH, LP = CONFIG.tileW, CONFIG.tileH, CONFIG.levelPx
local S = TW // 32 -- scale of hand-placed offsets

local function hexColor(h)
  return app.pixelColor.rgba(tonumber(h:sub(2, 3), 16), tonumber(h:sub(4, 5), 16), tonumber(h:sub(6, 7), 16), 255)
end
local C = {}
for k, v in pairs(CONFIG.colors) do
  if type(v) == "table" then
    C[k] = {}
    for i, h in ipairs(v) do C[k][i] = hexColor(h) end
  else
    C[k] = hexColor(v)
  end
end

-- deterministic noise
local function hash(x, y, s)
  local h = (x * 374761393 + y * 668265263 + (s or 0) * 2147483647 + CONFIG.seed * 144269) & 0xffffffff
  h = ((h ~ (h >> 13)) * 1274126177) & 0xffffffff
  return ((h ~ (h >> 16)) & 0xffff) / 65535
end
-- smooth value noise for large patches
local function smooth(x, y, s)
  local ix, iy = math.floor(x), math.floor(y)
  local fx, fy = x - ix, y - iy
  fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
  local a, b = hash(ix, iy, s), hash(ix + 1, iy, s)
  local c, d = hash(ix, iy + 1, s), hash(ix + 1, iy + 1, s)
  local top = a + (b - a) * fx
  return top + ((c + (d - c) * fx) - top) * fy
end
-- clustered speckles: -1, 0 or +1 tone shift in 2x2 blocks and rarer bigger stains
local function speckle(sx, sy, s)
  local small = hash(sx // 2, sy // 2, s)
  local big = hash(sx // 6, sy // 4, s + 50)
  if big < 0.08 or small < 0.08 then return -1 end
  if small > 0.94 or big > 0.96 then return 1 end
  return 0
end
local function clamp(v, a, b) return math.max(a, math.min(b, v)) end

local cells = {}
for z = 1, H do
  cells[z] = {}
  for x = 1, W do
    local ch = CONFIG.map[z]:sub(x, x)
    local cell = { h = 0, water = false, moss = false }
    if ch == "A" then cell.h = 10
    elseif ch == "w" then cell.water = true
    elseif ch == "m" then cell.water = true; cell.moss = true
    else cell.h = tonumber(ch) end
    cells[z][x] = cell
  end
end
local maxH = 10
local function heightAt(x, z)
  if x < 1 or z < 1 or x > W or z > H then return -1 end
  local c = cells[z][x]
  return c.water and 0 or c.h
end

-- screen position of the top corner of cell (x, z) on the ground
local originX = CONFIG.margin + (H - 1) * TW / 2
local originY = CONFIG.margin + maxH * LP
local function corner(x, z) return math.floor(originX + (x - z) * TW / 2), math.floor(originY + (x + z) * TH / 2) end

local imgW = originX + (W - 1) * TW / 2 + TW + CONFIG.margin
local imgH = originY + (W + H - 2) * TH / 2 + TH + CONFIG.margin

local spr = Sprite(math.floor(imgW), math.floor(imgH), ColorMode.RGB)
local function layer(name, first)
  local l = first and spr.layers[1] or spr:newLayer()
  l.name = name
  local cel = l:cel(1) or spr:newCel(l, 1)
  return l, cel.image
end

local _, bg = layer("background", true)
bg:clear(C.bg)
local _, terrain = layer("terrain")
local _, details = layer("details")
local _, props = layer("props")
local _, torches = layer("torches")
local _, darkness = layer("darkness")
local lightLayer, light = layer("light")
lightLayer.blendMode = BlendMode.ADDITION
lightLayer.opacity = 200

local function put(img, x, y, c)
  if x >= 0 and y >= 0 and x < img.width and y < img.height then img:drawPixel(x, y, c) end
end

-- span of the diamond at row dy (0..TH-1)
local function diamondSpan(dy)
  local w = dy < TH / 2 and (dy + 1) * 4 or (TH - dy) * 4
  return TW // 2 - w // 2, TW // 2 + w // 2 - 1
end
-- local iso coordinates (0..1) of a pixel inside a top diamond: u runs towards +x, v towards +z
local function localUV(px, dy)
  local dx = px + 0.5 - TW / 2
  local yy = dy + 0.5
  return (dx / (TW / 2) + yy / (TH / 2)) / 2, (yy / (TH / 2) - dx / (TW / 2)) / 2
end

-- top face of a floor / terrace column: four slabs with bevels, speckles, dirt, corner shading
local function floorPixel(x, z, cell, px, dy, sx, sy)
  local u, v = localUV(px, dy)
  local su, sv = u * 2, v * 2
  local iu, iv = clamp(math.floor(su), 0, 1), clamp(math.floor(sv), 0, 1)
  local fu, fv = su - iu, sv - iv
  local slab = hash(x * 2 + iu, z * 2 + iv, 40)
  local tone = 3 + (slab < 0.25 and -1 or (slab > 0.8 and 1 or 0)) + speckle(sx, sy, 4)
  local seam = 1.1 / (TH / 2) -- about one pixel in slab units
  if fu < seam or fv < seam then return C.crevice end
  if fu < seam * 2.2 or fv < seam * 2.2 then tone = tone + 1 end         -- lit upper bevel
  if fu > 1 - seam * 1.6 or fv > 1 - seam * 1.6 then tone = tone - 1 end -- shaded lower bevel
  -- ambient occlusion along the back edges when the neighbour there is taller
  local ao = 0
  if heightAt(x, z - 1) > cell.h and v < 0.24 then ao = ao + (v < 0.12 and 2 or (hash(sx, sy, 41) > 0.5 and 1 or 0)) end
  if heightAt(x - 1, z) > cell.h and u < 0.24 then ao = ao + (u < 0.12 and 2 or (hash(sx, sy, 42) > 0.5 and 1 or 0)) end
  tone = clamp(tone - ao, 1, 5)
  -- ochre dirt in large soft patches, dithered at the border
  local d = smooth(sx / 46, sy / 26, 43)
  if d > CONFIG.dirt and cell.h <= 4 then
    if d - CONFIG.dirt > 0.05 or hash(sx, sy, 44) > 0.5 then return C.dirt[clamp(tone - 1, 1, 4)] end
  end
  return C.top[tone]
end

-- Rock face: jittered boulders in staggered rows (a Voronoi pattern in face space). Face space un-skews the
-- iso slope so neighbouring columns on the same wall plane share one continuous pattern, without grid seams.
-- Returns 0 for the crevice between rocks, otherwise a tone 1..4 (lit top of each rock, shaded underside).
local ROCK = { w = 22, h = 15 } -- average boulder size in pixels
local function rockTone(sx, sy, leftFace)
  local fx = sx
  local fy = leftFace and (sy - sx / 2) or (sy + sx / 2)
  local salt = leftFace and 60 or 70
  local gx, gy = math.floor(fx / ROCK.w), math.floor(fy / ROCK.h)
  local best, second, by, id = 1e9, 1e9, 0, 0
  for oy = -1, 1 do
    for ox = -1, 1 do
      local cx_, cy_ = gx + ox, gy + oy
      local px_ = (cx_ + 0.15 + hash(cx_, cy_, salt) * 0.7 + (cy_ % 2) * 0.5) * ROCK.w
      local py_ = (cy_ + 0.25 + hash(cx_, cy_, salt + 1) * 0.5) * ROCK.h
      local d = (fx - px_) ^ 2 * 0.55 + (fy - py_) ^ 2 -- wider than tall
      if d < best then
        second, best, by, id = best, d, py_, hash(cx_, cy_, salt + 2)
      elseif d < second then
        second = d
      end
    end
  end
  local edge = math.sqrt(second) - math.sqrt(best)
  if edge < 1.2 then return 0 end
  local oy = fy - by
  local tone = 3 + (id < 0.3 and -1 or (id > 0.82 and 1 or 0))
  if oy < -ROCK.h * 0.22 then tone = tone + 1 end
  if oy > ROCK.h * 0.28 then tone = tone - 1 end
  if edge < 2.4 then tone = tone + (oy < 0 and 1 or -1) end -- lit upper lip, dark lower lip
  return clamp(tone + speckle(sx, sy, 61), 1, 4)
end

local function sideFaces(x, z, cx, topY, hPx, tall)
  local rocky = hPx >= 4 * LP
  for px = 0, TW - 1 do
    local leftFace = px < TW / 2
    local edgeY = leftFace and (TH // 2 + px // 2) or (TH - (px - TW // 2) // 2 - 1)
    local ramp = leftFace and C.left or C.right
    local facePx = leftFace and px or (px - TW // 2)
    for dy = 0, hPx - 1 do
      local sx, sy = cx + px, topY + edgeY + dy + 1
      local lv, inLevel = dy // LP, dy % LP
      local tone = 3 + speckle(sx, sy, 1)
      if rocky then
        tone = rockTone(sx, sy, leftFace)
        -- chipped rim: notches of 1-4 px eaten into the top edge
        local notch = hash(sx // 2, z * 31 + x, 62)
        if dy < 4 and notch < 0.3 and dy <= notch * 13 then tone = 0 end
      else
        -- masonry: horizontal joints between levels, vertical joints offset on every course
        local jointEvery = TW // 4
        local offset = math.floor(hash(x * 7 + (leftFace and 0 or 3), z * 5 + lv, 2) * jointEvery)
        local j = (facePx + offset) % jointEvery
        if inLevel == 0 and dy > 0 then tone = 1
        elseif inLevel == 1 and dy > 0 then tone = tone + 1
        elseif j == 0 then tone = 1
        elseif j == 1 then tone = tone + 1 end
      end
      if tall then
        -- cliffs: deep vertical cracks and damp darker stone towards the foot
        if hash(x * 13 + px // 3, z, 3) > 0.94 and hash(sx // 2, sy // 5, 4) > 0.3 then tone = 1 end
        if hPx - dy < LP and hash(sx, sy, 5) > 0.55 then tone = tone - 1 end
      end
      local c
      if tone == 0 then
        c = C.crevice
      else
        tone = clamp(tone, 1, 4)
        c = ramp[tone]
        if tall and hPx - dy < LP * 2 and smooth(sx / 9, sy / 30, 6) > 0.7 then c = C.moss[tone] end
      end
      put(terrain, sx, sy, c)
    end
  end
end

local function drawColumn(x, z)
  local cell = cells[z][x]
  local hPx = cell.h * LP
  local cx, cy = corner(x, z)
  local topY = cy - hPx
  local tall = cell.h >= 6
  local cliffTop = cell.h >= 8

  sideFaces(x, z, cx, topY, hPx, tall)

  for dy = 0, TH - 1 do
    local x0, x1 = diamondSpan(dy)
    for px = x0, x1 do
      local sx, sy = cx + px, topY + dy
      local c
      if cliffTop then
        c = C.cliffTop[clamp(2 + speckle(sx, sy, 7) + (hash(sx // 4, sy // 3, 8) > 0.85 and 1 or 0), 1, 4)]
      else
        c = floorPixel(x, z, cell, px, dy, sx, sy)
      end
      put(terrain, sx, sy, c)
    end
  end

  -- cliff tops: broken light lip along the front edges, with gaps
  if cliffTop then
    for px = 0, TW // 2 - 1 do
      if heightAt(x, z + 1) < cell.h and hash(cx + px, z, 63) > 0.3 then put(terrain, cx + px, topY + TH // 2 + px // 2, C.cliffTop[4]) end
      if heightAt(x + 1, z) < cell.h and hash(cx + TW // 2 + px, x, 64) > 0.3 then put(terrain, cx + TW // 2 + px, topY + TH - px // 2 - 1, C.cliffTop[4]) end
    end
  end

  if cell.h > 0 and not cliffTop then
    -- bright rim where the column drops to a lower neighbour in front
    if heightAt(x, z + 1) < cell.h then
      for px = 0, TW // 2 - 1 do put(terrain, cx + px, topY + TH // 2 + px // 2, C.top[5]) end
    end
    if heightAt(x + 1, z) < cell.h then
      for px = 0, TW // 2 - 1 do put(terrain, cx + TW // 2 + px, topY + TH - px // 2 - 1, C.top[5]) end
    end
    -- cracks: short random walks with a lit lower lip
    for k = 0, 3 do
      if hash(x * 4 + k, z, 9) < CONFIG.crackChance then
        local px = TW // 4 + math.floor(hash(x, z * 4 + k, 10) * TW / 2)
        local py = TH // 4 + math.floor(hash(x * 3 + k, z, 11) * TH / 2)
        local dir = hash(x, z, 12 + k) > 0.5 and 1 or -1
        for i = 0, 7 + math.floor(hash(x, z, 20 + k) * 10) do
          local x0, x1 = diamondSpan(clamp(py, 0, TH - 1))
          if px > x0 + 2 and px < x1 - 2 and py > 1 and py < TH - 2 then
            put(terrain, cx + px, topY + py, C.crevice)
            put(terrain, cx + px, topY + py + 1, C.top[4])
          end
          px = px + dir * (hash(x + i, z, 30 + k) > 0.25 and 2 or 1)
          if hash(x, z + i, 31 + k) > 0.5 then py = py + 1 end
        end
      end
    end
  end
end

local function drawWater(x, z)
  local cx, cy = corner(x, z)
  local wy = cy - math.floor(CONFIG.waterLevel * LP)
  for dy = 0, TH - 1 do
    local x0, x1 = diamondSpan(dy)
    for px = x0, x1 do
      local sx, sy = cx + px, wy + dy
      local wave = math.sin(sx * 0.22 + sy * 0.5) + math.sin(sx * 0.07 - sy * 0.3) * 0.8 + hash(sx // 2, sy, 8) * 0.5
      local c = C.water[2]
      if wave < -0.9 then c = C.water[1] elseif wave > 1.5 then c = C.water[4] elseif wave > 0.9 then c = C.water[3] end
      put(terrain, sx, sy, c)
    end
  end
  -- light line where water meets the pit walls at the back
  for px = 0, TW // 2 - 1 do
    if heightAt(x, z - 1) > 0 then put(terrain, cx + TW // 2 + px, wy + px // 2, C.water[4]) end
    if heightAt(x - 1, z) > 0 then put(terrain, cx + px, wy + TH // 2 - px // 2 - 1, C.water[4]) end
  end
end

local function drawMoss(x, z)
  local cx, cy = corner(x, z)
  local hPx = 3 * LP
  local topY = cy - hPx
  local inset = 4 * S
  for px = inset, TW - 1 - inset do
    local edgeY = px < TW / 2 and (TH // 2 + px // 2) or (TH - (px - TW // 2) // 2 - 1)
    for dy = 0, hPx - 1 do
      local tone = (px < TW / 2 and 3 or 2) + speckle(cx + px, topY + dy, 9)
      put(terrain, cx + px, topY + edgeY + dy + 1, C.moss[clamp(tone, 1, 4)])
    end
  end
  for dy = 2, TH - 3 do
    local x0, x1 = diamondSpan(dy)
    for px = math.max(x0, inset), math.min(x1, TW - 1 - inset) do
      put(terrain, cx + px, topY + dy, C.moss[clamp(4 + speckle(cx + px, dy, 10), 1, 4)])
    end
  end
end

-- painter's order: far cells first
for sum = 2, W + H do
  for z = 1, H do
    local x = sum - z
    if x >= 1 and x <= W then
      local cell = cells[z][x]
      drawColumn(x, z)
      if cell.water then drawWater(x, z) end
      if cell.moss then drawMoss(x, z) end
    end
  end
end

-- grass tufts and rubble only well inside a floor diamond, so they never float over walls
local function onTopOf(x, z, sx, sy)
  local cell = cells[z][x]
  local cx, cy = corner(x, z)
  local dy, px = sy - (cy - cell.h * LP), sx - cx
  if dy < 2 or dy > TH - 3 then return false end
  local x0, x1 = diamondSpan(dy)
  return px > x0 + 2 and px < x1 - 2
end
for z = 1, H do
  for x = 1, W do
    local cell = cells[z][x]
    if not cell.water and cell.h >= 2 and cell.h <= 6 then
      local cx, cy = corner(x, z)
      local topY = cy - cell.h * LP
      if hash(x, z, 11) < CONFIG.grassChance then
        local bx = cx + TW // 4 + math.floor(hash(x, z, 12) * TW / 2)
        local by = topY + TH // 2 + math.floor(hash(x, z, 13) * TH / 4)
        if onTopOf(x, z, bx, by) then
          for b = 0, 6 do
            local gx = bx + b - 3
            local tallness = 3 + math.floor(hash(x * 9 + b, z, 14) * 7)
            local lean = hash(x, z * 9 + b, 15) > 0.5 and 1 or -1
            for t = 0, tallness do
              local shade = clamp(1 + t * 4 // tallness + (b % 2), 1, 5)
              put(details, gx + (t > tallness * 0.6 and lean or 0), by - t, C.grass[shade])
            end
          end
        end
      end
      for r = 0, 3 do
        if hash(x * 5 + r, z, 16) < CONFIG.rubbleChance then
          local rx = cx + TW // 4 + math.floor(hash(x, z * 5 + r, 17) * TW / 2)
          local ry = topY + TH // 4 + math.floor(hash(x * 5 + r, z, 18) * TH / 2)
          if onTopOf(x, z, rx, ry) then
            put(details, rx, ry, C.top[5]); put(details, rx + 1, ry, C.top[4])
            put(details, rx, ry + 1, C.right[3]); put(details, rx + 1, ry + 1, C.right[2])
            put(details, rx - 1, ry + 2, C.crevice); put(details, rx, ry + 2, C.crevice); put(details, rx + 1, ry + 2, C.crevice)
            if hash(x, z, 19 + r) > 0.6 then
              put(details, rx + 2, ry, C.top[4]); put(details, rx + 2, ry + 1, C.right[2]); put(details, rx + 2, ry + 2, C.crevice)
            end
          end
        end
      end
    end
  end
end

-- PROPS --------------------------------------------------------------------------------------------------------
local LIGHT_DIR = { -0.7071, -0.7071 } -- light comes from the upper left of the picture

-- thick line whose side facing the light is lighter: used for branches and roots
local function stroke(img, x0, y0, x1, y1, t0, t1, ramp)
  local len = math.max(1, math.floor(math.sqrt((x1 - x0) ^ 2 + (y1 - y0) ^ 2) * 2))
  local nx, ny = -(y1 - y0), x1 - x0
  local nl = math.max(0.001, math.sqrt(nx * nx + ny * ny))
  nx, ny = nx / nl, ny / nl
  for i = 0, len do
    local k = i / len
    local x, y = x0 + (x1 - x0) * k, y0 + (y1 - y0) * k
    local half = (t0 + (t1 - t0) * k) / 2
    local o = -half
    while o <= half do
      local lit = (nx * LIGHT_DIR[1] + ny * LIGHT_DIR[2]) * (o / math.max(half, 0.5))
      local c = ramp[2]
      if lit > 0.3 then c = ramp[3] elseif lit < -0.3 then c = ramp[1] end
      put(img, math.floor(x + nx * o + 0.5), math.floor(y + ny * o + 0.5), c)
      o = o + 0.5
    end
  end
end

-- height of the top face under a picture pixel, or nil (front cells win, like the game's cellAtPoint)
local function topHeightAt(sx, sy, margin)
  for sum = W + H, 2, -1 do
    for z = H, 1, -1 do
      local x = sum - z
      if x >= 1 and x <= W then
        local c = cells[z][x]
        local cx, cy = corner(x, z)
        local mx, my = cx + TW / 2, cy - (c.water and 0 or c.h) * LP + TH / 2
        if math.abs(sx - mx) / (TW / 2 - margin) + math.abs(sy - my) / (TH / 2 - margin / 2) <= 1 then
          return c.water and -1 or c.h
        end
      end
    end
  end
  return nil
end

local function cellTopCenter(x, z)
  local cx, cy = corner(x, z)
  return cx + TW // 2, cy - cells[z][x].h * LP + TH // 2
end

-- shaded ellipse, lit towards the upper left, dark rim at the bottom
local function rock(img, cx, cy, rx, ry, ramp, outline)
  for x = -rx, rx + 2 do put(img, cx + x, cy + ry + 1, outline) end -- contact shadow
  for y = -ry, ry do
    for x = -rx, rx do
      local d = (x / rx) ^ 2 + (y / ry) ^ 2
      if d <= 1 then
        local l = -(x / rx + y / ry)
        local c = ramp[3]
        if l > 0.55 then c = ramp[4] elseif l < -0.6 then c = ramp[2] end
        if l < -1.1 then c = ramp[1] end
        if d > 0.78 then c = (y < 0 and x < 0) and ramp[2] or outline end -- dark rim, softer on the lit side
        put(img, cx + x, cy + y, c)
      end
    end
  end
end

-- dead tree: twisted trunk, recursive dead branches, roots crawling over the slabs it stands on
local function tree(x, z)
  local bx, by = cellTopCenter(x, z)
  local baseH = cells[z][x].h
  -- roots: random walks that stay on top faces of the same height
  for r = 0, 6 do
    local a = (r / 7) * math.pi * 2 + hash(r, x, 80) * 0.6
    local px, py = bx, by
    local thick = 6
    for step = 0, 12 do
      a = a + (hash(r, step, 81) - 0.5) * 0.7
      local nx, ny = px + math.cos(a) * 5, py + math.sin(a) * 2.5 -- squashed: roots lie on the iso floor
      if topHeightAt(math.floor(nx), math.floor(ny), 6) ~= baseH then break end
      put(props, math.floor(nx), math.floor(ny) + 2, C.crevice) -- root shadow
      stroke(props, px, py, nx, ny, thick, math.max(1, thick - 0.5), C.bark)
      px, py, thick = nx, ny, math.max(1, thick - 0.5)
    end
  end
  -- trunk in a few bent segments, then branches
  local function branch(x0, y0, angle, len, thick, depth, seed)
    local x1, y1 = x0 + math.cos(angle) * len, y0 + math.sin(angle) * len
    stroke(props, x0, y0, x1, y1, thick, math.max(1, thick * 0.72), C.bark)
    if depth == 0 or thick < 1.3 then return end
    local n = 2 + (hash(seed, depth, 82) > 0.55 and 1 or 0)
    for i = 1, n do
      local spread = (i - (n + 1) / 2) * 0.75 + (hash(seed, i, 83) - 0.5) * 0.5
      branch(x1, y1, angle + spread, len * (0.6 + hash(seed, i, 84) * 0.25), thick * 0.62, depth - 1, seed * 3 + i)
    end
  end
  local tx, ty, a = bx, by, -math.pi / 2
  local segs = { { 28, 13, 0.18 }, { 24, 11, -0.32 }, { 20, 9, 0.28 } }
  for _, sgm in ipairs(segs) do
    a = a + sgm[3]
    local nx, ny = tx + math.cos(a) * sgm[1], ty + math.sin(a) * sgm[1]
    stroke(props, tx, ty, nx, ny, sgm[2], sgm[2] * 0.85, C.bark)
    tx, ty = nx, ny
  end
  branch(tx, ty, a - 0.55, 30, 7.5, 5, 11)
  branch(tx, ty, a + 0.6, 27, 6.5, 5, 17)
  branch(tx, ty, a + 0.05, 22, 5, 4, 23)
end

-- broken column on a round plinth
local function column(x, z)
  local cx, cy = cellTopCenter(x, z)
  local function cylinder(ox, oy, r, ry, height, jag, flutes)
    for dx = -r, r do
      local t = dx / r
      local yb = oy + math.floor(ry * math.sqrt(1 - t * t))
      local yt = oy - height - math.floor(ry * math.sqrt(1 - t * t) * 0.6) + (jag and math.floor(hash(dx, x, 85) * 9) or 0)
      for y = yt, yb do
        local tone = t < -0.55 and 4 or (t < -0.1 and 3 or (t < 0.45 and 2 or 1))
        local c = tone == 4 and C.top[5] or (tone == 3 and C.top[3] or (tone == 2 and C.left[3] or C.right[2]))
        if flutes and (dx + r) % 4 == 0 and y > yt + 1 then c = tone >= 3 and C.top[2] or C.right[1] end
        if y == yt then c = C.top[5] end
        if y == yb then c = C.crevice end
        put(props, ox + dx, y, c)
      end
    end
    if not jag then -- flat top cap
      for dy = -ry, ry do
        for dx = -r, r do
          if (dx / r) ^ 2 + (dy / ry) ^ 2 <= 1 then put(props, ox + dx, oy - height + dy, (dx + dy < 0) and C.top[4] or C.top[3]) end
        end
      end
    end
  end
  cylinder(cx, cy, 17, 8, 7, false, false) -- plinth
  cylinder(cx, cy - 7, 13, 6, 58, true, true) -- shaft, broken on top
  -- fallen chunks around the base
  rock(props, cx + 20, cy + 4, 5, 3, C.top, C.crevice)
  rock(props, cx - 18, cy + 6, 4, 3, C.top, C.crevice)
  rock(props, cx + 12, cy + 9, 3, 2, C.top, C.crevice)
end

-- heap of stones: bigger at the bottom, piled up towards the middle
local function rubbleHeap(x, z)
  local cx, cy = cellTopCenter(x, z)
  local stones = {}
  for k = 1, 11 do
    local a, d = hash(k, x, 86) * math.pi * 2, math.sqrt(hash(k, z, 87))
    local sx, sy = math.floor(cx + math.cos(a) * d * 26), math.floor(cy + math.sin(a) * d * 12)
    local r = math.floor(10 - d * 4 + hash(k, 1, 88) * 3)
    sy = sy - math.floor((1 - d) * 16)
    table.insert(stones, { sx, sy, r })
  end
  table.sort(stones, function(a, b) return a[2] < b[2] end)
  local ramp = { C.right[1], C.left[2], C.left[3], C.top[4] }
  for _, st in ipairs(stones) do rock(props, st[1], st[2], st[3], math.max(3, math.floor(st[3] * 0.8)), ramp, C.crevice) end
end

-- two chains hanging on the front (left) face of a wall cell
local function chains(x, z)
  local cell = cells[z][x]
  assert(heightAt(x, z + 1) < cell.h - 3, "chains at " .. x .. "," .. z .. " would hang on a hidden face")
  local cx, cy = corner(x, z)
  local topY = cy - cell.h * LP
  for _, px in ipairs({ 10, 22 }) do
    local ax = cx + px
    local ay = topY + TH // 2 + px // 2 + 8
    for dx = -1, 2 do for dy = -1, 1 do put(props, ax + dx, ay + dy, C.iron[1]) end end -- wall ring
    local length = 30 + math.floor(hash(px, x, 89) * 18)
    for i = 0, length // 3 do
      local ly = ay + 2 + i * 3
      if i % 2 == 0 then -- link seen face on: a small ring
        put(props, ax, ly, C.iron[3]); put(props, ax + 1, ly, C.iron[2])
        put(props, ax - 1, ly + 1, C.iron[3]); put(props, ax + 2, ly + 1, C.iron[1])
        put(props, ax, ly + 2, C.iron[2]); put(props, ax + 1, ly + 2, C.iron[1])
      else -- link seen side on: a short bar
        for dy = 0, 2 do put(props, ax, ly + dy, dy == 0 and C.iron[3] or C.iron[2]) end
      end
    end
    -- open shackle at the end
    local ey = ay + 4 + (length // 3) * 3
    for _, p in ipairs({ { -2, 0 }, { -2, 1 }, { -1, 2 }, { 0, 2 }, { 1, 2 }, { 2, 1 }, { 2, 0 } }) do put(props, ax + p[1], ey + p[2], C.iron[p[1] < 0 and 3 or 2]) end
  end
end

-- a skull and a couple of bones near the middle of a cell
local SKULL = { ".XXXXX.", "XXXXXXX", "XoXXoXX", "XXXXXXX", ".XoXoX.", "..XXX.." }
local function bones(x, z)
  local cx, cy = cellTopCenter(x, z)
  local sx, sy = cx - 4 + math.floor(hash(x, z, 90) * 8), cy - 4 + math.floor(hash(x, z, 91) * 4)
  for row, line in ipairs(SKULL) do
    for col = 1, #line do
      local ch = line:sub(col, col)
      if ch == "X" then put(props, sx + col, sy + row, col >= 6 and C.bone[2] or C.bone[3])
      elseif ch == "o" then put(props, sx + col, sy + row, C.bone[1]) end
    end
  end
  for col = 2, 6 do put(props, sx + col, sy + 7, C.crevice) end -- shadow under the skull
  for b = 0, 1 do
    local bx, by = cx - 14 + b * 18, cy + 2 + b * 3
    local dir = b == 0 and 1 or -1
    for i = 0, 7 do
      put(props, bx + i, by + (i // 3) * dir, C.bone[3])
      put(props, bx + i, by + 1 + (i // 3) * dir, C.bone[2])
    end
    for _, k in ipairs({ { -1, -1 }, { -1, 1 }, { 8, -1 + 2 * dir }, { 8, 1 + 2 * dir } }) do put(props, bx + k[1], by + k[2], C.bone[3]) end
  end
end

do
  local P = CONFIG.props
  for _, b in ipairs(P.bones) do bones(b[1], b[2]) end
  rubbleHeap(P.rubble[1], P.rubble[2])
  column(P.column[1], P.column[2])
  chains(P.chains[1], P.chains[2])
  tree(P.tree[1], P.tree[2])
end

-- torches on the front face of tall walls, plus a warm light pool
for _, t in ipairs(CONFIG.torches) do
  local x, z, face = t[1], t[2], t[3]
  local cell = cells[z][x]
  local cx, cy = corner(x, z)
  local side = face == "side"
  local front = side and heightAt(x + 1, z) or heightAt(x, z + 1)
  assert(front < cell.h - 3, "torch at " .. x .. "," .. z .. " would hang on a hidden face")
  local tx = side and (cx + 3 * TW // 4) or (cx + TW // 4)
  local ty = cy - cell.h * LP + (side and (TH - TW // 8 - 1) or (TH // 2 + TW // 8)) + LP * 3
  -- bracket: post and a small cup
  for dy = 0, 6 * S do put(torches, tx, ty + dy, C.torch[1]); put(torches, tx + 1, ty + dy, C.torch[1]) end
  for dx = -2, 3 do put(torches, tx + dx, ty, C.torch[1]); put(torches, tx + dx, ty + 1, C.torch[1]) end
  -- flame: teardrop with a hot core
  local fh = 7 * S
  for fy = 1, fh do
    local half = math.floor((1 - fy / fh) * 2.5 * S + 0.5)
    for fx = -half, half + 1 do
      local core = math.abs(fx - 0.5) < half * 0.5 and fy < fh * 0.6
      local tip = fy > fh * 0.7
      put(torches, tx + fx, ty - fy, core and C.torch[4] or (tip and C.torch[2] or C.torch[3]))
    end
  end
  -- light: soft radial falloff in dithered steps, only on stone
  local radius = 85 * S
  local lr, lg, lb = app.pixelColor.rgbaR(C.light), app.pixelColor.rgbaG(C.light), app.pixelColor.rgbaB(C.light)
  for y = ty - radius, ty + radius do
    for x2 = tx - radius, tx + radius do
      local d = math.sqrt((x2 - tx) ^ 2 + ((y - ty) * 1.6) ^ 2) / radius
      if d < 1 and x2 >= 0 and y >= 0 and x2 < light.width and y < light.height and app.pixelColor.rgbaA(terrain:getPixel(x2, y)) > 0 then
        local k = (1 - d) ^ 2
        local stepK = math.floor(k * 6 + hash(x2, y, 20) * 0.9) / 6 * 0.8
        if stepK > 0 then
          local old = light:getPixel(x2, y)
          local r = math.min(255, app.pixelColor.rgbaR(old) + math.floor(lr * stepK))
          local g = math.min(255, app.pixelColor.rgbaG(old) + math.floor(lg * stepK))
          local b = math.min(255, app.pixelColor.rgbaB(old) + math.floor(lb * stepK))
          light:drawPixel(x2, y, app.pixelColor.rgba(r, g, b, 255))
        end
      end
    end
  end
end

-- darkness: fades the picture into the colour of the page panel towards its edges, fully opaque at the border
local edge = hexColor(CONFIG.colors.edge)
local er, eg, eb = app.pixelColor.rgbaR(edge), app.pixelColor.rgbaG(edge), app.pixelColor.rgbaB(edge)
local border = 48
for y = 0, darkness.height - 1 do
  for x = 0, darkness.width - 1 do
    local dx = (x / darkness.width - 0.5) * 2
    local dy = (y / darkness.height - 0.42) * 2.2
    local d = math.sqrt(dx * dx + dy * dy)
    local k = math.max(0, math.min(1, (d - 0.55) / 0.6))
    local e = math.min(x, darkness.width - 1 - x, y, darkness.height - 1 - y) / border
    if e < 1 then k = math.max(k, 1 - e) end
    local step = math.floor(k * 8 + hash(x, y, 30) * 0.8) / 8
    if e <= 0 then step = 1 end
    if step > 0 then darkness:drawPixel(x, y, app.pixelColor.rgba(er, eg, eb, math.floor(math.min(1, step) * 255))) end
  end
end

spr:saveAs(app.params.out)
print("dungeon " .. spr.width .. "x" .. spr.height)
