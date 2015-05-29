// This code illustrates the setup of a WebRTC call using WSP
// This code is only intended for illustration purposes
// It lacks details like exception and error handling
// In practice this code should run partly on the server and partly on the client.
// The WSP protocol must be used between the servers of the caller and the server of the callee
// For the communication between the server and the client any protocol could be used.
// If none has been established yet, ik makes sense of course to use the same WSP mechanism here as well.
// This sample code does not show this communication between the server and the client though

var invitation = {
	caller: {
		uri: 'alice@mywspserver.com',
		name: 'Alice'	// optional
	},
	callee: {
		uri: 'bob@hiswspserver.com',
		name: 'Bob'		// optional
	}
};

var webSocket, rtcPeerConnection, dataChannel, transferred;
var localMediaStream, remoteMediaStream;

transferred = false; // will become true once the WebRTC DataChannel takes over the signaling role from the WebSocket

// Initialize WebSocket for the initial signalling
var webSocket = new WebSocket('wss://hiswspserver.com/wsp','wsp-1.0');
webSocket.onmessage = handleWebSocketMessage;

// Initialize WebRTC for a direct connection between caller and callee.
var rtcPeerConnection = new RTCPeerConnection({iceServers: [{"url":"stun:stun.l.google.com:19302"}]});
rtcPeerConnection.onicecandidate = handleRTCPeerConnectionIceCandidate;
rtcPeerConnection.onaddstream = handleRTCPeerConnectionAddStream;
rtcPeerConnection.ondataChannel = handleRTCPeerConnectionDataChannel;

// Setup local camera and microphone
getUserMedia({video: true, audio: true}, function(mediaStream) {
	rtcPeerConnection.addStream(mediaStream);
	localMediaStream = mediaStream;	
	// ToDo: display mediaStream in local video element
});


// In this example we presume that both the caller and the callee have a websocket to their own servers.
//     the caller has a websocket connection to mywspserver.com
//     the callee has a websocket connection to hiswspserver.com

// The caller starts by sending an 'invite' signal to mywspserver.com.
webSocket.send(JSON.Stringify(['invite' , invitation]));

// mywspserver.com interprets the invitation and creates a connection to hiswspserver.com.
// hiswspserver.com receives the invitation from mywspserver.com.
// hiswspserver.com sends a 'ringing' signal to the callee.

// Both the caller and callee handle their signals the same way.
function handleWebSocketMessage(event){
	handleWspMessage(JSON.parse(event.data));
}

// Each signal has a keyword, content and options.
// In this example we will handle each signal keyword in a separate function.
function handleWspMessage(msg)
	var keyword = msg[0];
	var content = msg[1];
	var options = msg[2];	// not currently used
	switch (keyword) {
		case 'invite': handleSignalInvite(content);		// only relevant for callee
			// notice this should (primarily) be handled by the server
			// the server then checks if the callee is online
			// and notifies the appropriate client of an incoming call
			break;
		case 'ringing': handleSignalRinging();			// only relevant for caller
			break;
		case 'offer': handleSignalOffer(content);		// only relevant for caller
			break;
		case 'answer': handleSignalAnswer(content);		// only relevant for callee
			break;
		case 'icecandidate': handleSignalIceCandidate(content);
			break;
		case 'bye': handleSignalBye(content);
			break;
		default: 
			webSocket.close();
			throw 'Invalid WSP keyword';
	}
}

// HACK: This function is handled by the server.
function handleSignalInvite(invitation) {
	// ToDo: inform user that a call was received, based on the info in invitation
	webSocket.send(JSON.stringify(['ringing']));
}

// The callee receives a 'ringing' signal from hiswspserver.com.
// In this example we will automatically accept all calls,
// whereas most applications will play a ringing sound and allow the user (callee) to accept the call manually.
// Calls are accepted by first creating a WebRTC offer.
function handleSignalRinging() {
	// ToDo: tell the caller the bell is ringing at the callee...

	dataChannel = rtcPeerConnection.createDataChannel('wsp');
	rtcPeerConnection.createOffer(handleOfferCreated);
}

// Once the offer is created, the callee sends the offer back to the caller.
function handleOfferCreated(offer) {
	rtcPeerConnection.setLocalDescription(offer, function() {
		webSocket.send(JSON.Stringify(['offer' , offer]));
	});
}

// The offer is received by the caller; the caller creates an answer.
function handleSignalOffer(offer) {
	rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(offer), function() {
		rtcPeerConnection.createAnswer(handleAnswerCreated);
	});
}

// Once the answer is created, the caller sends the answer back to the callee.
function handleAnswerCreated(answer) {
	rtcPeerConnection.setLocalDescription(new RTCSessionDescription(answer), function() {
		webSocket.send(JSON.Stringify(['answer' , answer]));
	});
}

// The callee receives the answer and configures its WebRTC connection with it.
// This will trigger WebRTC of the caller and the callee to attempt to connect to eachother directly.
function handleSignalAnswer(answer){
	rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

// While attempting to connect directly over WebRTC, icecandidates are generated.
// Each icecandidate is a possible way to get a direct connection, so
// each one is send to other other side (both for caller and callee).
function handleRTCPeerConnectionIceCandidate(event) {
	if (event.candidate){
		if(!transferred){
			webSocket.send(JSON.Stringify(['icecandidate', event.candidate]);
		} else {
			dataChannel.send(JSON.Stringify(['icecandidate', event.candidate]);
		}
	}
}

// When icecandidates are received over the signalling socket, we add it to the WebRTC connection.
function handleSignalIceCandidate(candidate) {
	rtcPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

// Eventually the caller and callee get a direct connection.
// Streams are negotiated and received.

// The caller receives the video/audio stream of the callee and visa-versa.
function handleRTCPeerConnectionAddStream(event) {
	remoteMediaStream = event.stream;
	// ToDo: display event.stream in remote video element
}

// Next to the video/audio streams, the datachannel that was created by the callee will be received by the caller.
function handleRTCPeerConnectionDataChannel(event) {
	dataChannel = event.channel;
	dataChannel.onopen = handleDataChannelOpen;
	dataChannel.onmessage = handleDataChannelMessage;
}

// Once the datachannel is fully established, we will no longer need the websocket for signalling.
// We send a 'bye' signal with code 101, instructing the other side to transfer signalling over to its datachannel.
// We also transfer our signalling to the datachannel: further signals will be send through the datachannel.
function handleDataChannelOpen(){
	webSocket.send(JSON.stringify(['bye',{code: 101, description: 'Transferred'}]));
	transferred = true;
}

// The other end will get signalled that the signals are from now on send through the datachannel (reason.code === 101).
// For this case we can close the websocket and use the datachannel for sending further signals.
// The 'bye' signal is also used to end the call. So, for any other reason we will close all connections and stop the camera.
function handleSignalBye(reason){
	if(reason.code === 101){
		// the signaling has been taken over by the WebSocket Data Channel, so the websocket can be closed
		webSocket.close();
	} else {
		if(!tranferred){
			webSocket.close();
		} else {
			dataChannel.close();
		}
		localMediaStream.stop();
		remoteMediaStream.stop();
		// ToDo: inform the user the call has ended
	}
}

// Now, messages that are received on the datachannel are handled in the same way as messages we received on the websocket.
function handleDataChannelMessage(event) {
	handleWspMessage(JSON.parse(event.data));
}


// At this time we can do all signalling over WebRTC without using the websocket connections of either the caller nor the callee.

// We can stop the call by sending the 'bye' signal.
if(!transferred){
	webSocket.send(JSON.Stringify(['bye', {code: 200, description: 'User ended call normally'}]);
} else {
	dataChannel.send(JSON.Stringify(['bye', {code: 200, description: 'User ended call normally'}]);
}

// The other side will receive the 'bye' signal and closes all of its connections.
