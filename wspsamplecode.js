// This code illustrates the setup of a WebRTC call using WSP
// This code is only intended for illustration purposes
// It lacks details like exception and error handling
// Normally all WSP signaling is going from the client sotware of the caller
//   to the server software of the caller
//   and from there to the server software of the callee
//   which forwards most commands to the client software of the callee
//   and vice versa.
// To clarify the main structure of the WSP protocol we don't make a distinction
// between the client and the server software in this sample software.
// For the communication between the client and the server any protocol could be used.
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

var rtcPeerConnection, dataChannel;
var localMediaStream, remoteMediaStream;

var transferred = false; // will become true once the WebRTC DataChannel takes over the signaling role from the WebSocket

// Initialize WebRTC for a direct connection between caller and callee.
// the same code is used for the caller and the callee
rtcPeerConnection = new RTCPeerConnection({iceServers: [{"url":"stun:stun.l.google.com:19302"}]});
// and define the appropriate event handlers, to be specified later
rtcPeerConnection.onicecandidate = handleRTCPeerConnectionIceCandidate;
rtcPeerConnection.onaddstream = handleRTCPeerConnectionAddStream;
rtcPeerConnection.ondataChannel = handleRTCPeerConnectionDataChannel;

// Setup local camera and microphone
getUserMedia({video: true, audio: true}, function(mediaStream) {
	rtcPeerConnection.addStream(mediaStream);
	localMediaStream = mediaStream;	
	// ToDo: display mediaStream in local video element
});

// The caller starts by creating a websocket connection to the callee
var webSocket = new WebSocket('wss://hiswspserver.com/wsp','wsp-1.0');

// At the callee's end a listener should pickup the websocket connection
// This is typically handled by the callee's server and outside the scope of this sample

// Then the caller sends an 'invite' signal to the callee
webSocket.send(JSON.Stringify(['invite' , invitation]));


// Both the caller and callee handle their signals the same way.
webSocket.onmessage = handleWebSocketMessage;
function handleWebSocketMessage(event){
	handleWspMessage(JSON.parse(event.data));
}

// Each signal has a keyword, content and options (content and options might be empty).
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

// The next step is that the invite is received by the callee.
// Notice again that this is typically handled by the server
// The server checks if the callee is online and forwards the invite to the proper client.
// The code is this sample picks up things from there
function handleSignalInvite(invitation){

	// ToDo: inform user that a call was received, based on the info in invitation

	// inform the caller that callee's phone is ringing
	webSocket.send(JSON.stringify(['ringing']));

	// Once the call is accepted continue with creating a WebRTC DataChannel
	dataChannel = rtcPeerConnection.createDataChannel('wsp');
	// and create the offer and set the local description accordingly
	rtcPeerConnection.createOffer(handleOfferCreated);

	function handleOfferCreated(offer) {
		rtcPeerConnection.setLocalDescription(offer, handleLocalDescriptionSet);

		function handleLocalDescriptionSet() {
			// once all of that has been done, send the offer to the caller
			webSocket.send(JSON.Stringify([ 'offer' , offer]));
		}

	}
}

// Back at the caller's you may inform the user of the callee's phone actually ringing
function handleSignalRinging() {
	// ToDo: tell the caller the bell is ringing at the callee...
}

// And when the offer is received by the caller
// configure its WebRTC connection accordingly
function handleSignalOffer(offer){
	rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(offer), handleRemotedescriptionSet);

	function handleRemotedescriptionSet() {
		// when that is ready, create the answer
		rtcPeerConnection.createAnswer(handleAnswerCreated);
	}

	function handleAnswerCreated(answer) {
		// set the localdescription accordingly
		rtcPeerConnection.setLocalDescription(new RTCSessionDescription(answer), handleLocalDescriptionSet);

		function handleLocalDescriptionSet() {
			// and when all of that has been done, send the answer to the callee
			webSocket.send(JSON.Stringify([ 'answer' , answer]));
		}

	}

};

// The callee receives the answer and configures its WebRTC connection with it.
// This will trigger WebRTC of the caller and the callee to attempt to connect to eachother directly.
function handleSignalAnswer(answer){
	rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

// While attempting to connect directly over WebRTC, icecandidates are generated.
// Each icecandidate is a possible way to get a direct connection, so
// each one is send to the other end (both for caller and callee).
function handleRTCPeerConnectionIceCandidate(event) {
	if (event.candidate){
		if(!transferred){
			webSocket.send(JSON.Stringify(['icecandidate', event.candidate]);
		} else {
			dataChannel.send(JSON.Stringify(['icecandidate', event.candidate]);
		}
	}
}

// When icecandidates are received at the other end over the signalling socket, we add it to the WebRTC connection.
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
// We send a 'bye' signal with code 101, instructing the other end to transfer signalling over to its datachannel.
// We also transfer our signalling to the datachannel: further signals will be send through the datachannel.
// Notice that we cannot close the websocket yet, since there might still be messages in the pipeline
function handleDataChannelOpen(){
	webSocket.send(JSON.stringify(['bye',{code: 101, description: 'Transferred'}]));
	transferred = true;
}

// The other end will get signalled that the signals are from now on send through the datachannel (reason.code === 101).
// We can now close the websocket and use the datachannel for sending further signals.
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

// Now, messages received on the datachannel are handled in the same way as messages received on the websocket.
function handleDataChannelMessage(event) {
	handleWspMessage(JSON.parse(event.data));
}

// At this time we can do all signalling over WebRTC without using the websocket connection.
// So in a client/server environment, also the server is not involved in the signaling anymore.

// We can end the call by sending the 'bye/200' signal.
if(!transferred){
	webSocket.send(JSON.Stringify(['bye', {code: 200, description: 'User ended call normally'}]);
} else {
	dataChannel.send(JSON.Stringify(['bye', {code: 200, description: 'User ended call normally'}]);
}

// The other end will receive the 'bye' signal and closes all of its connections as shown before.
