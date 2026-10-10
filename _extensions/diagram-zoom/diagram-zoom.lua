-- diagram-zoom: add the zoom viewer to JavaScript-capable HTML pages (documents, websites,
-- books). Slides and every non-HTML format are left untouched.

local VERSION = "0.1.0"

-- Named one by one: quarto.format.is_html_slide_output() is true for any HTML before
-- Quarto 1.8 (quarto-dev/quarto-cli#13334).
local SLIDE_FORMATS = { "revealjs", "slidy", "slideous", "s5", "dzslides" }

local function is_slides()
  for _, format in ipairs(SLIDE_FORMATS) do
    if quarto.doc.is_format(format) then return true end
  end
  return false
end

function Meta(meta)
  if quarto.doc.is_format("html:js") and not is_slides() then
    quarto.doc.add_html_dependency({
      name = "diagram-zoom",
      version = VERSION,
      scripts = {
        "diagram-zoom.js",
        -- the glue needs <body>; head scripts run before it exists
        { path = "diagram-zoom-quarto.js", afterBody = true },
      },
      stylesheets = { "diagram-zoom.css" },
    })
  end
end
