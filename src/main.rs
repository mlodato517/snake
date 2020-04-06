use std::{
    collections::HashMap,
    fs,
    io::Error as IoError,
    net::SocketAddr,
    str,
    sync::{Arc, Mutex},
};

use futures::prelude::*;
use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    future, join, pin_mut,
};

use async_std::net::{TcpListener, TcpStream};
use async_std::task;
use tungstenite::protocol::Message;

type Tx = UnboundedSender<Message>;
type PeerMap = Arc<Mutex<HashMap<SocketAddr, Tx>>>;

async fn handle_websocket_connection(
    peer_map: PeerMap,
    raw_stream: TcpStream,
    addr: SocketAddr,
    id: u8,
) {
    println!("Incoming TCP connection from: {}", addr);

    let ws_stream = async_tungstenite::accept_async(raw_stream)
        .await
        .expect("Error during the websocket handshake occurred");
    println!("WebSocket connection established: {}", addr);

    let (tx, rx) = unbounded();

    // Alert client of their ID.
    tx.unbounded_send(Message::Text(format!("id:{}", id)))
        .unwrap();

    // Insert the write part of this peer to the peer map.
    peer_map.lock().unwrap().insert(addr, tx);

    let (outgoing, incoming) = ws_stream.split();

    let broadcast_incoming = incoming.try_for_each(|msg| {
        // println!("{} | {:?}", addr, msg);
        if msg.is_close() { return future::ok(()) }

        let peers = peer_map.lock().unwrap();

        // We want to broadcast the message to everyone except ourselves.
        let broadcast_recipients = peers
            .iter()
            .filter(|(peer_addr, _)| peer_addr != &&addr)
            .map(|(_, ws_sink)| ws_sink);

        for recp in broadcast_recipients {
            recp.unbounded_send(msg.clone()).unwrap();
        }

        future::ok(())
    });

    let receive_from_others = rx.map(Ok).forward(outgoing);

    pin_mut!(broadcast_incoming, receive_from_others);
    future::select(broadcast_incoming, receive_from_others).await;

    println!("{} disconnected", &addr);
    peer_map.lock().unwrap().remove(&addr);
}

async fn handle_websocket() -> Result<(), IoError> {
    let websocket_address = "127.0.0.1:3012".to_string();

    let state = PeerMap::new(Mutex::new(HashMap::new()));

    // Create the event loop and TCP listener we'll accept connections on.
    let try_websocket_socket = TcpListener::bind(&websocket_address).await;
    let websocket_listener = try_websocket_socket.expect("Failed to bind");
    println!("Listening on: {}", websocket_address);

    // Let's spawn the handling of each connection in a separate task.
    let mut id = 1;
    while let Ok((stream, addr)) = websocket_listener.accept().await {
        task::spawn(handle_websocket_connection(state.clone(), stream, addr, id));
        id = (id % 8) + 1;
    }

    Ok(())
}

async fn send_rest_response(mut raw_stream: TcpStream, response: &str) -> Result<(), IoError> {
    let http_response = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{}",
        response.len(),
        response,
    );
    raw_stream.write(http_response.as_bytes()).await?;
    raw_stream.flush().await?;

    Ok(())
}

async fn handle_rest_connection(mut raw_stream: TcpStream) -> Result<(), IoError> {
    let mut buffer = [0; 32];
    raw_stream.read(&mut buffer).await?;
    let request = str::from_utf8(&buffer).unwrap();

    if request.starts_with("GET / HTTP/1.1") {
        let response = fs::read_to_string("build/index.html")?;
        send_rest_response(raw_stream, &response).await?
    } else if request.starts_with("GET /index.js HTTP/1.1") {
        let response = fs::read_to_string("build/index.js")?;
        send_rest_response(raw_stream, &response).await?
    }

    Ok(())
}

async fn handle_rest() -> Result<(), IoError> {
    let rest_address = "127.0.0.1:3013".to_string();

    let try_rest_socket = TcpListener::bind(&rest_address).await;
    let rest_listener = try_rest_socket.expect("Failed to bind");
    println!("Listening on: {}", rest_address);

    // Let's spawn the handling of each connection in a separate task.
    while let Ok((stream, _addr)) = rest_listener.accept().await {
        task::spawn(handle_rest_connection(stream));
    }

    Ok(())
}

async fn run() -> Result<(), IoError> {
    let (ws_res, rest_res) = join!(handle_websocket(), handle_rest());
    if ws_res.is_err() {
        ws_res
    } else if rest_res.is_err() {
        rest_res
    } else {
        Ok(())
    }
}

fn main() -> Result<(), IoError> {
    task::block_on(run())
}
