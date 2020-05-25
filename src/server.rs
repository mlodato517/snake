//! `ChatServer` is an actor. It maintains list of connection client session.
//! And manages available rooms. Peers send messages to other peers in same
//! room through `ChatServer`.

use actix::prelude::*;
use std::collections::HashMap;

/// Chat server sends this messages to session
#[derive(Message)]
#[rtype(result = "()")]
pub struct Message(pub String);

/// Message for chat server communications

/// New chat session is created
#[derive(Message)]
#[rtype(usize)]
pub struct Connect {
    pub addr: Recipient<Message>,
}

/// Send message
#[derive(Message)]
#[rtype(result = "()")]
pub struct ClientMessage {
    pub id: usize,
    pub msg: String,
}

/// Client disconnected
#[derive(Message)]
#[rtype(result = "()")]
pub struct Disconnect {
    pub id: usize,
}

/// `ChatServer` manages chat rooms and responsible for coordinating chat
/// session. implementation is super primitive
pub struct ChatServer {
    current_id: usize,
    sessions: HashMap<usize, Recipient<Message>>,
}

impl Default for ChatServer {
    fn default() -> ChatServer {
        ChatServer {
            current_id: 0,
            sessions: HashMap::new(),
        }
    }
}

impl ChatServer {
    fn broadcast(&self, message: &str, skip_id: usize) {
        self.sessions
            .iter()
            .filter(|(&id, _)| id != skip_id)
            .for_each(|(_, addr)| {
                let _ = addr.do_send(Message(message.to_owned()));
            });
    }

    fn send_message(&self, message: &str, addr: &Recipient<Message>) {
        let _ = addr.do_send(Message(message.to_owned()));
    }
}

/// Make actor from `ChatServer`
impl Actor for ChatServer {
    /// We are going to use simple Context, we just need ability to communicate
    /// with other actors.
    type Context = Context<Self>;
}

/// Handler for Connect message.
///
/// Register new session and assign unique id to this session
impl Handler<Connect> for ChatServer {
    type Result = usize;

    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) -> Self::Result {
        self.current_id += 1;
        let sent_id = self.current_id;

        self.send_message(format!("id:{}", sent_id).as_str(), &msg.addr);
        self.sessions.insert(sent_id, msg.addr);

        sent_id
    }
}

/// Handler for general message.
impl Handler<ClientMessage> for ChatServer {
    type Result = ();

    fn handle(&mut self, msg: ClientMessage, _: &mut Context<Self>) {
        self.broadcast(msg.msg.as_str(), msg.id);
    }
}

/// Handler for Disconnect message.
impl Handler<Disconnect> for ChatServer {
    type Result = ();

    fn handle(&mut self, msg: Disconnect, _: &mut Context<Self>) {
        self.sessions.remove(&msg.id);
    }
}
