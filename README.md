# React HTML-in-Canvas DOM Event Projection

[Live demo](https://cgutiguti.github.io/react-in-html-in-canvas/)

This experiment uses Chrome's experimental HTML-in-Canvas APIs to render a live React/shadcn DOM subtree into a WebGL scene, project it onto 3D geometry, and route pointer, wheel, drag, range, and text-input interactions back to the original DOM controls.

The important part is that the React component remains real DOM. Chrome provides the element texture, while the custom renderer uses a GPU pick pass to map canvas-space hits back into projected DOM coordinates.


https://github.com/user-attachments/assets/c46855db-80a6-4286-b4dc-57c17352fd46

