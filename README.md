# Brian Shagaya portfolio

A professional portfolio for Brian Munyaradzi Shagaya, an Information Systems graduate based in Marondera, Zimbabwe.

## Portfolio

The website contains professional background, skills, a downloadable CV, contact links and three interactive practice projects.

| Project | Features |
| --- | --- |
| Support ticket workspace | Create tickets, search and filter issues, save troubleshooting notes, update status and record resolution. |
| Personal task planner | Add tasks, set priorities, complete tasks, filter the list and save browser-local progress. |
| Programming assessment | Complete five JavaScript code-reading questions and review automatic marking and explanations. |

The three demos were newly created for this portfolio with AI assistance. They are clearly labelled as practice projects and are separate from the earlier academic and client work referenced in the supplied CV.

## Run locally

Serve the repository root with any static HTTP server. For example:

```bash
python -m http.server 8000
```

Open the local address printed by the server. There is no build step or package installation.

## Publish with GitHub Pages

In the repository settings, open Pages, choose deployment from a branch, and select `main` and `/(root)`. The `.nojekyll` file preserves the static HTML site.

## Source

- `index.html`: semantic page structure and portfolio content
- `styles.css`: responsive styling
- `app.js`: interactive demo workflows
- `assets/brian-shagaya-cv.docx`: supplied CV
- `assets/portfolio-source.zip`: downloadable source

Tickets and tasks are saved only in the visitor browser. The quiz stays in the page session. These demos do not have a shared database, execute submitted code or send data to a server.

The source download includes the HTML, CSS, JavaScript, CV and this README. The ZIP itself is not nested inside its own download.

## NyazuraMusika Android marketplace

[NyazuraMusika](projects/nyazuramusika) is a native Android marketplace with Google accounts, admin/user/seller roles, saved goods, private live inspections, product photos and WhatsApp contact. It includes a direct EcoCash app handoff and printable seller-confirmed payment records. Google setup and service activation are still required; the project README includes the current setup, build and testing instructions.
