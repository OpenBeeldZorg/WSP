
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

var webSocket = new WebSocket('wss://hiswspserver.com/wsp','wsp-1.0');
var transferred = false;	// will become true once the WebRTC DataChannel takes over the signaling role from the WebSocket

webSocket.send(JSON.Stringify([ 'invite' , invitation]));

webSocket.onmessage = function(event){
	handleWspMessage(event.data);
};

function handleWspMessage(data)
	var msg = JSON.parse(data);
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

function handleSignalRinging() {
	// ToDo: tell the caller the bell is ringing at the callee...
}

// fill in your own ice (stun or turn) servers...
var rtcPeerConnection = new RTCPeerConnection({iceServers: [{"url":"stun:stun.l.google.com:19302"}] });

function handleSignalOffer(offer){
	rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(offer), handleRemotedescriptionSet);

	function handleRemotedescriptionSet() {
		rtcPeerConnection.createAnswer(handleAnswerCreated);
	}

	function handleAnswerCreated(answer) {
		rtcPeerConnection.setLocalDescription(new RTCSessionDescription(answer), handleLocalDescriptionSet);

		function handleLocalDescriptionSet() {
			webSocket.send(JSON.Stringify([ 'answer' , answer]));
		}

	}

};

rtcPeerConnection.onicecandidate = function(event){
	if (event.candidate){
		if(!transferred){
			webSocket.send(JSON.Stringify(['icecandidate', event.candidate]);
		} else {
			dataChannel.send(JSON.Stringify(['icecandidate', event.candidate]);
		}
	}
}

function handleSignalIceCandidate(candidate){
	rtcPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

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
		// ToDo: inform the user the call has been closed
	}
}

var dataChannel;
// notice the WebRTC DataChannel will be created by callee after receiving invite
rtcPeerConnection.ondataChannel = function(event){
	dataChannel = event.channel;
	dataChannel.onopen = handleDataChannelOpen;
	dataChannel.onmessage = handleDataChannelMessage;

	function handleDataChannelOpen(){
		webSocket.send(JSON.stringify(['bye',{code: 101, description: 'Transferred'}]));
		transferred = true;
	}

	function handleDataChannelMessage(event) {
		handleWspMessage(event.data);
	}

};

// open mediastreams
var localMediaStream, remoteMediaStream;
getUserMedia({video: true, audio: true}, handleGotUserMedia);

function handleGotUserMedia(mediaStream) {
	rtcPeerConnection.addStream(mediaStream);
	localMediaStream = mediaStream;
	// ToDo: display mediaStream in local video element
}

rtcPeerConnection.onaddstream = function(event){
	remoteMediaStream = event.stream;
	// ToDo: display event.stream in remote video element
};

// To close the session:
if(!transferred){
		webSocket.send(JSON.Stringify(['bye', {code: 200, description: 'User ended call normally'}]);
	} else {
		dataChannel.send(JSON.Stringify(['bye', {code: 200, description: 'User ended call normally'}]);
	}
}

// And this needs to be added specifically on behalf of the receiving end (callee)
// ToDo: setting up websocket listener on behalf of callee (on server),
// handle the WSP invite keyword
// and notify the user (callee), making him picking up the phone
// In this illustration we assume this results in the same websocket being established as created before
// using the same handleWspMessage function

function handleSignalInvite(invitation){
	// ToDo: inform user that a call was received, based on the info in invitation
	webSocket.send(JSON.stringify(['ringing']));
	// Once the call is accepted continue with:
	dataChannel = rtcPeerConnection.createDataChannel('wsp');
	rtcPeerConnection.createOffer(handleOfferCreated);

	function handleOfferCreated(offer) {
		rtcPeerConnection.setLocalDescription(offer, handleLocalDescriptionSet);

		function handleLocalDescriptionSet() {
			webSocket.send(JSON.Stringify([ 'offer' , offer]));
		}

	}
}

function handleSignalAnswer(answer){
	rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}
