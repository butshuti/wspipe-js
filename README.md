# wspipe-js
A Javascript module for multiplexing WebSocket pipes.
## Installation 
```sh
npm install git+https://git@github.com/butshuti/wspipe-js.git --save
```
## Usage

### TypeScript
####Discovering new peers
```typescript
import {Peer, DiscoveryClient, PeersChangeListener} from 'wspipe-js';
let url: URL = ....;
let peerUpdatesLister: PeersChangeListener = ...; 
const peerUpdatesLister = {
	onNewPeers: function(peers:Peer[]) void {
		console.log(peers);	// Do something with newly-discovered peers.
	}
};
new DiscoveryClient(url, peerUpdatesLister).start(null);
```

####Creating a multiplexed stream
```typescript
import {Peer, EventStream, WSEventStream, WSEventStreamConfig, 
    RelayedWSEventStream, EventHandler, StatusMonitor} from 'wspipe-js';

let url: URL = .....; // Relay server enpoint
let handler: EventHandler = ...; // Processes messages from peers
let monitor: StatusMonitor = ...; // Processes changes in stream status
let tag: string = ...; //label for stream
let streamConfig: WSEventStreamConfig = new WSEventStreamConfig(url, false);
let eventStream: EventStream = RelayedWSEventStream.getInstance().withConfig(streamConfig).withStatusMonitor(monitor);
eventStream.registerHandler(tag, handler);
```

####Starting a session with a remote peer
```typescript
let peer: Peer = ...;
eventStream.start(peer);
// To stop the session: eventStream.stop(peer);
```
