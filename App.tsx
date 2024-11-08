import * as React from 'react';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const FlappyBird3D: React.FC = () => {
    const mountRef = React.useRef<HTMLDivElement>(null);
    const [score, setScore] = React.useState(0);
    const [maxScore, setMaxScore] = React.useState(() => parseInt(localStorage.getItem('maxScore') || '0', 10));
    const [gameOver, setGameOver] = React.useState(false);
    const [gamePaused, setGamePaused] = React.useState(false); // Estado de pausa
    const animationId = React.useRef<number | null>(null);

    // Crear instancias de los sonidos
    const collisionSound = new Audio('models/barra-de-metal-cayendo.mp3');
    const jumpSound = new Audio('models/yippeeeeeeeeeeeeee.mp3');
    const gameOverSound = new Audio('models/sad-meow-song.mp3');

    // Función para reproducir un sonido, sin control de sobreposición
    const playSound = (audio: HTMLAudioElement) => {
        audio.currentTime = 0; // Asegura que el audio comienza desde el principio
        audio.play();
    };

    React.useEffect(() => {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 5, 20);  // Elevar la cámara en el eje Y
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (mountRef.current) {
            mountRef.current.appendChild(renderer.domElement);
        }

        // ** Agregar neblina a la escena **
        scene.fog = new THREE.Fog(0xaaaaaa, 10, 50);  // color, near, far

        const ambientLight = new THREE.AmbientLight(0x99aaff, 1);
        scene.add(ambientLight);

        const rgbeLoader = new RGBELoader();
        rgbeLoader.load('models/brown_photostudio_02_1k.exr', (texture: THREE.Texture | null) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = texture;
        });

        const jpgLoader = new THREE.TextureLoader();
        jpgLoader.load('models/chapel_day.jpg', (texturejpg) => {
            texturejpg.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texturejpg;
        });

        const gltfLoader = new GLTFLoader();
        let player: THREE.Object3D<THREE.Object3DEventMap>;
        let playerBox: THREE.Box3 = new THREE.Box3();
        let playerRotation = 0;

        gltfLoader.load('models/stylized_valorant_toy_knife/scene.gltf', (gltf: { scene: THREE.Object3D<THREE.Object3DEventMap>; }) => {
            player = gltf.scene;
            player.scale.set(0.01, 0.01, 0.01);
            player.position.set(0, 0, 0);
            scene.add(player);
            playerBox.setFromObject(player);
        });

        // ** Modelo 3D de fondo (sin colisión) **
        let backgroundModel: THREE.Object3DEventMap;
        gltfLoader.load('models/cloud/scene.gltf', (gltf: { scene: THREE.Object3DEventMap; }) => {
            backgroundModel = gltf.scene;
            backgroundModel.scale.set(8, 8, 8); // Escalar el fondo
            backgroundModel.position.set(-1000, -5, -30); // Posicionar al fondo (detrás)
            scene.add(backgroundModel);

            // Clonación infinita del fondo
            setInterval(() => {
                const clone = backgroundModel.clone();
                clone.position.set(Math.random() * 100 - 50, -5, -30);
                scene.add(clone);

                // Movimiento de izquierda a derecha
                const moveSpeed = Math.random() * 0.05 + 0.05; // Velocidad aleatoria para cada clon
                const move = () => {
                    if (clone.position.x > 50) {
                        scene.remove(clone);
                    } else {
                        clone.position.x += moveSpeed;
                    }
                    requestAnimationFrame(move);
                };
                move();
            }, Math.random() * 2000 + 1000); // Crear un clon entre 1 y 3 segundos
        });

        let obstacleModel: THREE.Object3DEventMap;
        const obstacles: { mesh: THREE.Object3DEventMap; box: THREE.Box3 }[] = [];
        const recentYPositions: number[] = [];

        gltfLoader.load('models/3d_scan_quixel_megascans_metal_pallet_racking/scene.gltf', (gltf: { scene: THREE.Object3DEventMap; }) => {
            obstacleModel = gltf.scene;
            for (let i = 0; i < 5; i++) {
                createObstacle(i * 10 + 20);
            }
        });

        const createObstacle = (x: number) => {
            if (!obstacleModel) return;

            const obstacle = obstacleModel.clone();
            
            // Generar una escala aleatoria entre un rango específico (por ejemplo, 4-8)
            const scaleX = Math.random() * 4 + 4; // Rango aleatorio entre 4 y 8
            const scaleY = Math.random() * 4 + 4; // Rango aleatorio entre 4 y 8
            const scaleZ = Math.random() * 4 + 4; // Rango aleatorio entre 4 y 8

            obstacle.scale.set(scaleX, scaleY, scaleZ);

            let positionY: number;
            let attempts = 0;
            do {
                const upper = Math.random() > 0.5;
                positionY = upper ? Math.random() * 10 + 10 : Math.random() * -10 - 10;
                attempts++;
            } while (recentYPositions.slice(-3).includes(positionY) && attempts < 10);

            recentYPositions.push(positionY);
            if (recentYPositions.length > 3) {
                recentYPositions.shift(); 
            }

            obstacle.position.set(x, positionY, 0);
            obstacle.userData.passed = false;
            scene.add(obstacle);

            const obstacleBox = new THREE.Box3().setFromObject(obstacle);
            obstacles.push({ mesh: obstacle, box: obstacleBox });
        };

        let velocity = 0;
        const gravity = -0.005;
        const jumpStrength = 0.15;

        const handleSpacebar = (event: KeyboardEvent) => {
            if (event.code === 'Space' && !gameOver && !gamePaused) {
                velocity = jumpStrength;
                playerRotation += Math.PI * 2;

                playSound(jumpSound);
            }
        };

        window.addEventListener('keydown', handleSpacebar);

        const animate = () => {
            if (gameOver) {
                if (animationId.current) cancelAnimationFrame(animationId.current);
                return;
            }

            animationId.current = requestAnimationFrame(animate);

            if (player) {
                player.position.y += velocity;
                velocity += gravity;

                // Limitar el movimiento en el eje Y (evitar que el cuchillo se salga de la pantalla)
                if (player.position.y < -5) player.position.y = -5;
                if (player.position.y > window.innerHeight / 2) player.position.y = window.innerHeight / 2;

                if (player.rotation.z < playerRotation) {
                    player.rotation.z += 0.1;
                } else {
                    player.rotation.z = playerRotation;
                }

                playerBox.copy(new THREE.Box3().setFromObject(player));
            }

            obstacles.forEach(({ mesh, box }) => {
                mesh.position.x -= 0.1;
                box.copy(new THREE.Box3().setFromObject(mesh));

                if (player && mesh.position.x < player.position.x && !mesh.userData.passed) {
                    mesh.userData.passed = true;
                    setScore((prevScore) => {
                        const newScore = prevScore + 1;
                        if (newScore > maxScore) {
                            setMaxScore(newScore);
                            localStorage.setItem('maxScore', newScore.toString());
                        }
                        return newScore;
                    });
                }

                if (mesh.position.x < -15) {
                    mesh.position.x = 40;
                    mesh.position.y = Math.random() > 0.5 ? Math.random() * 5 + 5 : Math.random() * -5 - 5;
                    mesh.userData.passed = false;
                }
            });

            if (player) {
                obstacles.forEach(({ box }) => {
                    if (playerBox.intersectsBox(box)) {
                        playSound(collisionSound); // Reproducir sonido de colisión
                        setGamePaused(true); // Pausar el juego
                        setTimeout(() => {
                            setGameOver(true); // Mostrar pantalla de "Perdiste"
                            playSound(gameOverSound); // Reproducir sonido de "Perdiste"
                        }, 1000); // 4 segundos después de la colisión
                    }
                });
            }

            renderer.render(scene, camera);
        };

        animate();

        const onWindowResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };

        window.addEventListener('resize', onWindowResize, false);

        return () => {
            window.removeEventListener('resize', onWindowResize);
            window.removeEventListener('keydown', handleSpacebar);
            if (mountRef.current) {
                mountRef.current.removeChild(renderer.domElement);
            }
            if (animationId.current) cancelAnimationFrame(animationId.current);
        };
    }, [maxScore, gameOver, gamePaused]);

    return (
        <div ref={mountRef}>
            <div style={{ position: 'absolute', top: '10px', left: '10px', color: 'white', fontSize: '20px' }}>
                <p>Score: {score}</p>
                <p>Max Score: {maxScore}</p>
            </div>
            {gameOver && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: 'black',
                    fontSize: '50px',
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '50px',
                    textAlign: 'center'
                }}>
                    ¡Perdiste!
                </div>
            )}
        </div>
    );
};

const App: React.FC = () => {
    return (
        <div>
            <FlappyBird3D />
        </div>
    );
};

export default App;
