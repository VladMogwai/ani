-- Builds two frame-by-frame pixel-art effects in Aseprite:
--   fireball.aseprite  16x16, 6 frames, tag "fly"   (drawn flying to the right; the game rotates it)
--   explosion.aseprite 48x48, 10 frames, tag "burst"
-- Run: aseprite -b --script-param dir=<output folder> --script build-fx.lua

local dir = app.params.dir
local SEED = 3

local function hex(h)
  return app.pixelColor.rgba(tonumber(h:sub(2, 3), 16), tonumber(h:sub(4, 5), 16), tonumber(h:sub(6, 7), 16), 255)
end
local FIRE = { hex("#fff6d0"), hex("#ffd36b"), hex("#ff9a3c"), hex("#e8551f"), hex("#8f2a14") } -- hot to cool
local SMOKE = { hex("#6b6461"), hex("#4f4946"), hex("#3a3532") }

local function hash(x, y, s)
  local h = (x * 374761393 + y * 668265263 + s * 2147483647 + SEED * 144269) & 0xffffffff
  h = ((h ~ (h >> 13)) * 1274126177) & 0xffffffff
  return ((h ~ (h >> 16)) & 0xffff) / 65535
end
local function noise(x, y, s)
  local ix, iy = math.floor(x), math.floor(y)
  local fx, fy = x - ix, y - iy
  fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
  local a, b = hash(ix, iy, s), hash(ix + 1, iy, s)
  local c, d = hash(ix, iy + 1, s), hash(ix + 1, iy + 1, s)
  local top = a + (b - a) * fx
  return top + ((c + (d - c) * fx) - top) * fy
end

local function newSprite(size, frames, durationMs, tagName)
  local spr = Sprite(size, size, ColorMode.RGB)
  for _ = 2, frames do spr:newEmptyFrame() end
  for i = 1, frames do spr.frames[i].duration = durationMs[i] / 1000 end
  local tag = spr:newTag(1, frames)
  tag.name = tagName
  return spr
end
local function image(spr, frame)
  local cel = spr.layers[1]:cel(frame) or spr:newCel(spr.layers[1], frame)
  return cel.image
end
local function put(img, x, y, c)
  if x >= 0 and y >= 0 and x < img.width and y < img.height then img:drawPixel(x, y, c) end
end

---------------------------------------------------------------------------------------------------------------
-- FIREBALL: a hot core, a flickering body and flame tongues licking backwards (to the left)
do
  local N = 6
  local spr = newSprite(16, N, { 70, 70, 70, 70, 70, 70 }, "fly")
  for f = 1, N do
    local img = image(spr, f)
    local cx, cy = 10, 8
    for y = 0, 15 do
      for x = 0, 15 do
        local dx, dy = x + 0.5 - cx, y + 0.5 - cy
        -- the flame is stretched backwards and its edge wobbles from frame to frame
        local back = dx < 0 and (-dx) * 0.7 or 0
        local wob = (noise(x * 0.6 + f * 1.7, y * 0.6 - f * 0.9, 1) - 0.5) * 2.4
        local d = math.sqrt((dx + back) ^ 2 * 0.9 + dy * dy * (1 + back * 0.25)) + wob * (dx < 0 and 1 or 0.4)
        local tail = dx < 0 and -dx / 9 or 0 -- how far into the tail this pixel is
        if d < 2.0 then put(img, x, y, FIRE[1])
        elseif d < 3.3 then put(img, x, y, FIRE[2])
        elseif d < 4.6 then put(img, x, y, tail > 0.6 and FIRE[4] or FIRE[3])
        elseif d < 5.8 then
          if hash(x, y, f + 10) > 0.25 then put(img, x, y, tail > 0.4 and FIRE[5] or FIRE[4]) end
        elseif d < 6.8 and dx < 0 and hash(x, y, f + 20) > 0.7 then
          put(img, x, y, FIRE[5]) -- loose embers in the tail
        end
      end
    end
  end
  spr:saveAs(dir .. "/fireball.aseprite")
end

---------------------------------------------------------------------------------------------------------------
-- EXPLOSION: white flash, swelling fire ball with a ragged edge, break-up into blobs, sparks, rising smoke
do
  local N = 10
  local spr = newSprite(48, N, { 50, 50, 60, 70, 70, 80, 90, 100, 110, 120 }, "burst")
  local C = 24
  -- sparks: fixed directions and speeds, positions grow with time
  local sparks = {}
  for i = 1, 14 do
    local a = hash(i, 0, 30) * math.pi * 2
    table.insert(sparks, { math.cos(a), math.sin(a) * 0.75, 9 + hash(i, 1, 31) * 12 })
  end
  for f = 1, N do
    local img = image(spr, f)
    local t = (f - 1) / (N - 1) -- 0..1
    local R = f == 1 and 4 or (f == 2 and 9 or 15 + math.min(4, (f - 3) * 1.5)) -- fire radius
    local heat = math.max(0, 1 - t * 1.25) -- the fire cools as it grows
    local fireFade = math.max(0, (t - 0.45) / 0.45) -- holes open up in the fire in the second half
    -- smoke puffs rise and spread after the first third
    if t > 0.3 then
      local s = (t - 0.3) / 0.7
      for p = 1, 6 do
        local px = C + (hash(p, 2, 40) - 0.5) * 22 * (0.5 + s)
        local py = C - 2 - s * 12 - hash(p, 3, 41) * 6
        local pr = 3 + s * 6 + hash(p, 4, 42) * 2
        for y = math.floor(py - pr), math.ceil(py + pr) do
          for x = math.floor(px - pr), math.ceil(px + pr) do
            local d = math.sqrt((x - px) ^ 2 + (y - py) ^ 2) / pr
            local edge = d + (noise(x * 0.4, y * 0.4 + f, 43) - 0.5) * 0.5
            -- smoke thins out in soft patches (not per-pixel static)
            if edge < 1 and noise(x * 0.45 + p * 3, y * 0.45 - f * 0.7, 45) > s * 0.85 then
              put(img, x, y, edge < 0.5 and SMOKE[1] or (edge < 0.8 and SMOKE[2] or SMOKE[3]))
            end
          end
        end
      end
    end
    -- fire
    for y = 0, 47 do
      for x = 0, 47 do
        local dx, dy = x + 0.5 - C, y + 0.5 - C
        local d = math.sqrt(dx * dx + dy * dy * 1.2)
        local n = noise(x * 0.25 + f * 0.6, y * 0.25 - f * 0.4, 50)
        local edge = d / R + (n - 0.5) * 0.55
        if edge < 1 and noise(x * 0.35, y * 0.35 + f, 51) > fireFade * 0.9 then
          local k = edge - heat * 0.35 -- inner pixels and early frames are hotter
          local c
          if f <= 2 then c = edge < 0.6 and FIRE[1] or FIRE[2]
          elseif k < 0.1 then c = FIRE[1]
          elseif k < 0.35 then c = FIRE[2]
          elseif k < 0.6 then c = FIRE[3]
          elseif k < 0.82 then c = FIRE[4]
          else c = FIRE[5] end
          if edge < 0.55 and (c == FIRE[4] or c == FIRE[5]) then c = FIRE[3] end -- no dark specks inside
          put(img, x, y, c)
        end
      end
    end
    -- sparks: a bright head and a short darker trail, fading out
    if f >= 3 then
      for i, sp in ipairs(sparks) do
        local dist = sp[3] * (t * 1.3 + 0.25)
        local sx, sy = math.floor(C + sp[1] * dist + 0.5), math.floor(C + sp[2] * dist + 0.5 + t * t * 8)
        -- only once the spark has left the fire ball, otherwise its dark trail speckles the fire
        if dist > R * 0.9 and (t < 0.85 or hash(i, f, 60) > 0.5) then
          put(img, sx, sy, t < 0.5 and FIRE[1] or FIRE[2])
          put(img, math.floor(sx - sp[1] * 1.5 + 0.5), math.floor(sy - sp[2] * 1.5 + 0.5), FIRE[3])
          if t < 0.5 then put(img, math.floor(sx - sp[1] * 3 + 0.5), math.floor(sy - sp[2] * 3 + 0.5), FIRE[4]) end
        end
      end
    end
  end
  spr:saveAs(dir .. "/explosion.aseprite")
end

print("fx built in " .. dir)
