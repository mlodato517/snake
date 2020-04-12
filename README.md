# Setup

## Installation

### Rust + Cargo
Install rust and cargo using [`rustup`](https://doc.rust-lang.org/book/ch01-01-installation.html#installation).

## Running

Start the server with `cargo run --release`.

Navigate to `127.0.0.1:3013` in a browser.

### Playing with other people

To play with users from other networks, you need to implement some sort of port
forwarding solution. A free option is [`ngrok`](https://ngrok.com/).

After installing, you need to use port forwarding for _both_ ports used by this application:
```
ngrok http 3013 # In one terminal window
ngrok http 3012 # In another terminal window
```

Then, because `index.js` is currently hard coded to `127.0.0.1:3012` you need to change
[`host`](https://github.com/mlodato517/snake/blob/master/build/index.js#L18) in `build/index.js`
to be the address output by `ngrok http 3012` for example:
```js
const host = 'a50c4f04.ngrok.io'
```

Then users should be able to connect and play by going to the address output by `ngrok http 3013`.

A full example:
1. Run `cargo run --release`
1. `ngrok http 3013` (e.g. `Forwarding http://c1034d36.ngrok.io -> http://localhost:3013`)
1. `ngrok http 3012` (e.g. `Forwarding http://a50c4f04.ngrok.io -> http://localhost:3012`)
1. Change `index.js` to `const host = 'a50c4f04.ngrok.io'`
1. Open a web browser to `http://c1034d36.ngrok.io`

## Troubleshooting

### Cargo build
If you encounter an issue like "error: `core::slice::<impl [T]>::len`
is not yet stable as a const fn" ensure you have at least version 1.39 of `rustc`:
```
rustc --version
```
If you need a newer version, try:
```
rustup update stable
rustup default stable
rustc --version
```
