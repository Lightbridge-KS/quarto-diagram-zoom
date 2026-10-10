-- diagram-zoom: add the zoom viewer to JavaScript-capable HTML pages (documents, websites,
-- books). Slides and every non-HTML format are left untouched.

local VERSION = "0.1.0"

function Meta(meta)
  if quarto.doc.is_format("html:js") and not quarto.format.is_html_slide_output() then
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
