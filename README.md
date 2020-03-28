## Setup

### Install cargo

### Cargo build
If you encounter an issue like "error: `core::slice::<impl [T]>::len`
is not yet stable as a const fn" ensure you have at least version 1.39 of `rustc`
```
rustc --version
```
If you need a newer version, try:
```
rustup update stable
rustup default stable
rustc --version
```

## Running

Start the server with `cargo run --release`.

Open the `index.html` file in a browser.
