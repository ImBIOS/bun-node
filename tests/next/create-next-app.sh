!#/bin/bash

bun init -y
bun add @remix-run/node @remix-run/react @remix-run/serve isbot react react-dom
mkdir app
touch app/root.jsx

# Inserting boilerplate for app/root.jsx
cat <<EOF > app/root.jsx
import {
  Links,
  Meta,
  Outlet,
  Scripts,
} from "@remix-run/react";

export default function App() {
  return (
    <html>
      <head>
        <link
          rel="icon"
          href="data:image/x-icon;base64,AA"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <h1>Hello world!</h1>
        <Outlet />

        <Scripts />
      </body>
    </html>
  );
}
EOF
