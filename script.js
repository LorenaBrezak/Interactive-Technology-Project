// Getting Elements from the DOM and Initializing State
document.addEventListener('DOMContentLoaded', function () {
	const lampOnImg = document.getElementById('lamp-on'); // lamp on image
	const lampOffImg = document.getElementById('lamp-off'); // lamp off image
	const lampContainer = document.getElementById('asset-lamp'); // lamp container
	const clapperOpenImg = document.getElementById('clapper-open'); // stick
	const clapperClosedImg = document.getElementById('clapper-closed'); // slate
    const micImg = document.getElementById('asset-Mic'); // microphone image
	const audiovisualsText = document.getElementById('audiovisuals-text');
	const body = document.body;
	let lampOn = true;
	let clapperAngle = -35; // degrees; open is negative, closed is 0, clapper starts open
	let isDraggingClapper = false;
	let dragStartY = 0;
	let dragStartAngle = -35;

	// Clapper sound
	let clapperClosing = false; // true when snapping toward 0deg
	let playOnPointerUp = false; // only play after a release + closed
	const clapperAudio = new Audio('sounds/movie-clapper-sound.mp3');
	clapperAudio.preload = 'auto';

	// Mic pendulum state
	let micDragging = false;
	let micAngle = 0; // radians; 0 = vertical
	let micAngularVelocity = 0; // rad/s
	let micLastTs = 0;
	let micSwingHandle = null;
	let micDragOffset = 0; // pointer angle minus micAngle at drag start
	let micDownX = 0, micDownY = 0; // for click detection
	let micClickEligible = false;

	// Mic click sound
	const micClickAudio = new Audio('sounds/mic-check-sound.mp3'); // mic click sound
	micClickAudio.preload = 'auto'; // auto-load sound

	// Set initial background state
	body.classList.add('light-bg');
	lampOnImg.style.display = 'block';
	lampOffImg.style.display = 'none';
	// Initialize clapper visuals (slate visible, stick in open rotation)
	if (clapperOpenImg) {
		clapperOpenImg.style.transform = 'rotate(' + clapperAngle + 'deg)';
	}

    // Initialize mic visual
    if (micImg) {
        micImg.style.transform = 'translateX(-50%) rotate(0deg)';
    }

	// Helper to check if mouse is over lamp, hover state
	function isHovered(img) {
		return img.matches(':hover');
	}

	function setTransformed(img, state) {
		if (state) {
			img.classList.add('transformed');
		} else {
			img.classList.remove('transformed');
		}
	}

	// Lamp toggle function
	function toggleLamp() {
		const wasTransformed = lampOn ? isHovered(lampOnImg) : isHovered(lampOffImg);
		lampOn = !lampOn;
		if (lampOn) {
			body.classList.remove('dark-bg');
			body.classList.add('light-bg');
			lampOnImg.style.display = 'block';
			lampOffImg.style.display = 'none';
			audiovisualsText.style.color = 'black';
			setTransformed(lampOnImg, wasTransformed);
		} else {
			body.classList.remove('light-bg');
			body.classList.add('dark-bg');
			lampOnImg.style.display = 'none';
			lampOffImg.style.display = 'block';
			audiovisualsText.style.color = 'white';
			setTransformed(lampOffImg, wasTransformed);
		}
	}

	// --- Light switch sound on lamp container click ---
	const lightSwitchAudio = new Audio('sounds/light-switch-sound.mp3');
	lightSwitchAudio.preload = 'auto';
	if (lampContainer) {
		lampContainer.addEventListener('click', function(){
			try { lightSwitchAudio.currentTime = 0; lightSwitchAudio.play(); } catch(_) {}
		});
	}

	function setClapperAngle(angle) {
		clapperAngle = Math.max(-70, Math.min(0, angle));
		if (clapperOpenImg) {
			clapperOpenImg.style.transform = 'rotate(' + clapperAngle + 'deg)';
		}
	}

	function snapClapper() {
		// If near closed, snap shut; otherwise snap open
		const target = (clapperAngle > -10) ? 0 : -35; // using if threshold at -10deg

		// mark if we're closing to 0deg; transitionend may play sound if pointer was released
		clapperClosing = (target === 0 && clapperAngle !== 0);
		setClapperAngle(target);
	}

	// event listeners for lamp images
	lampOnImg.addEventListener('click', toggleLamp);
	lampOffImg.addEventListener('click', toggleLamp);

	// Clapper interactions
	if (clapperOpenImg) {
		// Play sound right when the stick reaches 0deg (after CSS transition ends)
		clapperOpenImg.addEventListener('transitionend', function(e){
			if (e.propertyName === 'transform' && clapperClosing && clapperAngle === 0) {
				if (playOnPointerUp) {
					try { clapperAudio.currentTime = 0; clapperAudio.play(); } catch(_) {}
					playOnPointerUp = false;
				}
				clapperClosing = false;
			}
		});
		// Drag to close/open
		clapperOpenImg.addEventListener('pointerdown', function(e) {
			e.preventDefault();
			isDraggingClapper = true;
			dragStartY = e.clientY;
			dragStartAngle = clapperAngle;
			clapperOpenImg.classList.add('dragging');
			clapperOpenImg.setPointerCapture(e.pointerId);
		});
		clapperOpenImg.addEventListener('pointermove', function(e) {
			if (!isDraggingClapper) return;
			const dy = e.clientY - dragStartY;
			setClapperAngle(dragStartAngle + dy * 0.5);
		});
		['pointerup','pointercancel','pointerleave'].forEach(function(type){
			clapperOpenImg.addEventListener(type, function(e){
				if (!isDraggingClapper) return;
				isDraggingClapper = false;
				try { clapperOpenImg.releasePointerCapture(e.pointerId); } catch(_) {}
				clapperOpenImg.classList.remove('dragging');
				// On release, if we end up closed, play sound (either immediately or after transition)
				playOnPointerUp = true;
				snapClapper();
				// If already closed (no transition will fire), play now
				if (playOnPointerUp && clapperAngle === 0 && !clapperClosing) {
					try { clapperAudio.currentTime = 0; clapperAudio.play(); } catch(_) {}
					playOnPointerUp = false;
				}
			});
		});
	}

	// --- Mic pendulum interactions ---
	function micSetAngle(rad) {
		// constrain to +/- ~70deg
		const max = 70 * Math.PI / 180;
		micAngle = Math.max(-max, Math.min(max, rad));
		if (micImg) {
			micImg.style.transform = 'translateX(-50%) rotate(' + (micAngle * 180/Math.PI) + 'deg)';
		}
	}

	function micPhysicsStep(ts) {
		if (!micLastTs) micLastTs = ts;
		const dt = Math.min(0.03, (ts - micLastTs) / 1000); // cap dt for stability
		micLastTs = ts;
		// Parameters
		const gOverL = 25; // natural frequency squared ~ (rad/s)^2 (tune)
		const damping = 0.8; // s^-1 linear damping (tune)
		// Nonlinear pendulum acceleration
		const accel = -gOverL * Math.sin(micAngle) - damping * micAngularVelocity;
		micAngularVelocity += accel * dt;
		micAngle += micAngularVelocity * dt;
		micSetAngle(micAngle);
		// stop condition
		const velThresh = 0.02; // rad/s
		const angThresh = 0.01; // rad
		if (Math.abs(micAngularVelocity) < velThresh && Math.abs(micAngle) < angThresh) {
			micSetAngle(0);
			micSwingHandle = null;
			micLastTs = 0;
			return;
		}
		micSwingHandle = requestAnimationFrame(micPhysicsStep);
	}

	function micStartSwing() {
		if (micSwingHandle) cancelAnimationFrame(micSwingHandle);
		micLastTs = 0;
		micSwingHandle = requestAnimationFrame(micPhysicsStep);
	}

	function angleFromPointerToPivot(clientX, clientY) {
		const rect = micImg.getBoundingClientRect();
		const pivotX = rect.left + rect.width / 2; // top-center x
		const pivotY = rect.top; // top y
		const dx = clientX - pivotX;
		const dy = clientY - pivotY;
		// angle relative to vertical: positive to the right
		// Invert sign so dragging right yields positive clockwise rotation
		const angle = -Math.atan2(dx, dy);
		return angle; // radians
	}

	if (micImg) {
		micImg.addEventListener('pointerdown', function(e){
			e.preventDefault();
			micDragging = true;
			micImg.classList.add('dragging');
			if (micSwingHandle) { cancelAnimationFrame(micSwingHandle); micSwingHandle = null; }
			micAngularVelocity = 0;
			// Keep current visual angle; compute offset so the mic doesn't jump on grab
			const pointerAngle = angleFromPointerToPivot(e.clientX, e.clientY);
			micDragOffset = pointerAngle - micAngle;
			micImg.setPointerCapture(e.pointerId);
			micLastTs = performance.now();
			// click detection
			micDownX = e.clientX; micDownY = e.clientY; micClickEligible = true;
		});
		micImg.addEventListener('pointermove', function(e){
			if (!micDragging) return;
			const prevAngle = micAngle;
			const pointerAngle = angleFromPointerToPivot(e.clientX, e.clientY);
			const nowAngle = pointerAngle - micDragOffset;
			const nowTs = performance.now();
			const dt = Math.max(0.001, (nowTs - micLastTs) / 1000);
			micLastTs = nowTs;
			// estimate angular velocity from drag
			micAngularVelocity = (nowAngle - prevAngle) / dt;
			micSetAngle(nowAngle);
			// cancel click if movement is significant
			const dx = e.clientX - micDownX, dy = e.clientY - micDownY;
			if ((dx*dx + dy*dy) > 64) { // > 8px movement
				micClickEligible = false;
			}
		});
		['pointerup','pointercancel','pointerleave'].forEach(function(type){
			micImg.addEventListener(type, function(e){
				if (!micDragging) return;
				micDragging = false;
				micImg.classList.remove('dragging');
				try { micImg.releasePointerCapture(e.pointerId); } catch(_) {}
				// treat as click if small movement
				if (micClickEligible) {
					try { micClickAudio.currentTime = 0; micClickAudio.play(); } catch(_) {}
				}
				// start swing with current angle and velocity
				micStartSwing();
			});
		});
	}

	// Keep transformed state on hover
	lampOnImg.addEventListener('mouseenter', function() {
		setTransformed(lampOnImg, true);
	});
	lampOnImg.addEventListener('mouseleave', function() {
		setTransformed(lampOnImg, false);
	});
	lampOffImg.addEventListener('mouseenter', function() {
		setTransformed(lampOffImg, true);
	});
	lampOffImg.addEventListener('mouseleave', function() {
		setTransformed(lampOffImg, false);
	});

	// Reference overlay controls
	// Usage: reference image is at images/referenceMain.png (can be changed via setReferenceOverlay('images/yourfile.png'))
	

	// --- MovieTape frame flipping control elements ---
	const megaphoneImg = document.getElementById('asset-Megaphone');
	const megaphoneButton = document.getElementById('asset-Megaphone-Button');
	const tapeContainer = document.getElementById('asset-MovieTape'); // layered container
	let tapeAnimating = false;
	let tapeTimer = null;
	let innerIdx = 0;
	let outerIdx = 0;
	let innerFrames = [];
	let outerFrames = [];
	let framesReady = false;

	// Tape rolling sound (skip first seconds on each start/loop)
	const tapeAudio = new Audio('sounds/movie-tape-sound.mp3');
	tapeAudio.preload = 'auto';
	// We'll manage looping manually to always skip the intro segment
	tapeAudio.loop = false;
	const TAPE_SKIP_SECONDS = 3; // always skip the first 3 seconds of the tape sound for more realistic loop

	function startTapeSound() {
		try {
			tapeAudio.currentTime = TAPE_SKIP_SECONDS;
			tapeAudio.play();
		} catch(_) {}
	}

	function stopTapeSound() {
		try {
			tapeAudio.pause();
			tapeAudio.currentTime = 0;
		} catch(_) {}
	}

	// When audio ends, re-play from after the skipped intro as long as animation is running
	tapeAudio.addEventListener('ended', function(){
		if (tapeAnimating) {
			startTapeSound();
		}
	});

	function initTapeFrames() {
		if (framesReady || !tapeContainer) return;
		innerFrames = Array.prototype.slice.call(tapeContainer.querySelectorAll('.tape-inner'))
			.sort(function(a,b){ return (+a.dataset.frame) - (+b.dataset.frame); });
		outerFrames = Array.prototype.slice.call(tapeContainer.querySelectorAll('.tape-outer'))
			.sort(function(a,b){ return (+a.dataset.frame) - (+b.dataset.frame); });

		// helper to find index by data-frame value, fallback to 0
		function findIndexByFrame(list, frameNum) {
			for (var i = 0; i < list.length; i++) {
				if (+list[i].dataset.frame === frameNum) return i;
			}
			return list.length ? 0 : -1;
		}

		// Determine initial visible frames: inner=6, outer=12
		innerIdx = findIndexByFrame(innerFrames, 6);
		outerIdx = findIndexByFrame(outerFrames, 12);

		// Hide all overlay frames, then show the initial chosen ones
		innerFrames.forEach(function(el){ el.style.display = 'none'; });
		outerFrames.forEach(function(el){ el.style.display = 'none'; });
		if (innerIdx >= 0 && innerFrames[innerIdx]) innerFrames[innerIdx].style.display = 'block';
		if (outerIdx >= 0 && outerFrames[outerIdx]) outerFrames[outerIdx].style.display = 'block';

		framesReady = true;
	}

	function tapeShowFrame(list, prev, next) {
		if (!list || list.length === 0) return;
		if (prev != null && prev >= 0 && prev < list.length) {
			list[prev].style.display = 'none';
		}
		if (next != null && next >= 0 && next < list.length) {
			list[next].style.display = 'block';
		}
	}

	function tapeStep() {
		var pI = innerIdx;
		var pO = outerIdx;
		innerIdx = (innerIdx + 1) % (innerFrames.length || 1);
		outerIdx = (outerIdx + 1) % (outerFrames.length || 1);
		tapeShowFrame(innerFrames, pI, innerIdx);
		tapeShowFrame(outerFrames, pO, outerIdx);
	}

	function tapeStart() {
		if (tapeAnimating) return;
		if (!framesReady) initTapeFrames();
		var FRAME_MS = 120; // adjust speed here
		tapeTimer = setInterval(tapeStep, FRAME_MS);
		tapeAnimating = true;
	}

	function tapeStop() {
		if (!tapeAnimating) return;
		clearInterval(tapeTimer);
		tapeTimer = null;
		// Do not hide current frames; keep whatever is visible
		tapeAnimating = false;
	}

	// Toggle helper available to any control
	const toggleTape = function() {
		if (tapeAnimating) {
			// stop tape + sound
			tapeStop();
			stopTapeSound();
		} else {
			// start tape + sound
			tapeStart();
			startTapeSound();
		}
	};

	// Control exclusively via the Button: click or keyboard activation
	if (megaphoneButton && tapeContainer) {
		initTapeFrames();
		megaphoneButton.addEventListener('click', function(e){ e.preventDefault(); toggleTape(); });
		megaphoneButton.addEventListener('keydown', function(e){
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTape(); }
		});
	}

	// Initialize frames once on load so inner 3 and outer 11 are visible by default
	initTapeFrames();
});
