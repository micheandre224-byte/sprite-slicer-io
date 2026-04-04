import React, { useState, Suspense, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, Grid, Center, Environment } from '@react-three/drei';
import { Upload, Box, Maximize2, RotateCcw, Grid3X3, HelpCircle } from 'lucide-react';

function Model({ url, onLoad }: { url: string; onLoad: () => void }) {
  const { scene } = useGLTF(url);
  
  React.useEffect(() => {
    if (scene) {
      onLoad();
    }
  }, [scene, onLoad]);

  return <primitive object={scene} />;
}

function Loading({ isLoading }: { isLoading: boolean }) {
  if (!isLoading) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-20 h-20 mb-6">
        <div className="absolute inset-0 border-4 border-emerald-500/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-emerald-500 rounded-full animate-spin shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-emerald-500 font-bold tracking-[0.3em] animate-pulse text-xs uppercase">
          Carregando Modelo 3D...
        </p>
        <div className="w-48 h-0.5 bg-neutral-800 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-emerald-500 animate-[loading_2s_infinite]" />
        </div>
      </div>
    </div>
  );
}

// Custom component to handle the timer and frame updates
function SceneContent({ modelUrl, showGrid, onModelLoad }: { modelUrl: string | null, showGrid: boolean, onModelLoad: () => void }) {
  // Using THREE.Timer as requested, with a fallback for safety
  const timer = useRef<any>(null);
  
  if (!timer.current && (THREE as any).Timer) {
    timer.current = new (THREE as any).Timer();
  }

  useFrame((state) => {
    if (timer.current) {
      timer.current.update(state.clock.getElapsedTime() * 1000);
    }
  });

  return (
    <>
      <color attach="background" args={['#1a1a1a']} />
      
      {/* DEBUG CUBE: If you see this, 3D is working! */}
      <mesh position={[0, 2, 0]} rotation={[0.5, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.5} />
      </mesh>

      <Suspense fallback={null}>
        {modelUrl && (
          <Stage 
            environment="city" 
            intensity={0.5} 
            shadows={{ type: 'contact', opacity: 0.7, blur: 2 }}
            adjustCamera={true}
          >
            <Center>
              <Model url={modelUrl} onLoad={onModelLoad} />
            </Center>
          </Stage>
        )}
        {showGrid && (
          <Grid 
            infiniteGrid 
            fadeDistance={50} 
            fadeStrength={5} 
            sectionSize={1} 
            sectionColor="#1a1a1a" 
            cellColor="#111" 
          />
        )}
      </Suspense>
      {showGrid && <gridHelper args={[20, 20, '#333', '#222']} />}
      <OrbitControls makeDefault target={[0, 1, 0]} />
    </>
  );
}

export default function ThreeDViewer() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedVfxType, setSelectedVfxType] = useState<string>('');
  const [selectedEngine, setSelectedEngine] = useState<'csharp' | 'js' | ''>('');
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const actions = [
    { id: 'idle', label: 'Parado / Idle' },
    { id: 'walk', label: 'Andar / Correr' },
    { id: 'jump', label: 'Pular / Cair' },
    { id: 'crouch', label: 'Agachar' },
    { id: 'damage', label: 'Receber Dano' },
    { id: 'attack', label: 'Atacar' },
    { id: 'vfx', label: 'VFX / Efeito' },
  ];

  const vfxTypes = [
    { id: 'scenario', label: 'Cenário / Fundo' },
    { id: 'impact', label: 'Impacto' },
    { id: 'distance', label: 'Distância' },
    { id: 'vfx_attack', label: 'Ataque' },
  ];

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialPos, setTutorialPos] = useState({ top: 0, left: 0, show: false });

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('threeDTutorialSeen');
    if (!hasSeenTutorial) {
      setTimeout(() => setShowTutorial(true), 500);
      localStorage.setItem('threeDTutorialSeen', 'true');
    }
  }, []);

  const tutorialSteps = [
    {
      target: 'tutorial-3d-upload',
      title: 'Carregar Modelo 3D',
      content: 'Faça upload do seu modelo 3D nos formatos .glb ou .gltf para visualizá-lo.',
      position: 'bottom'
    },
    {
      target: 'tutorial-3d-action',
      title: 'Selecionar Ação',
      content: 'Escolha a ação que deseja gerar o script para o seu modelo 3D.',
      position: 'bottom'
    },
    {
      target: 'tutorial-3d-engine',
      title: 'Escolher Engine',
      content: 'Selecione a engine ou linguagem para a qual deseja gerar o script (C# Unity ou JavaScript).',
      position: 'bottom'
    },
    {
      target: 'tutorial-3d-generate',
      title: 'Gerar Script',
      content: 'Clique aqui para gerar o script com base na ação e engine selecionadas.',
      position: 'bottom'
    }
  ];

  useEffect(() => {
    if (!showTutorial) return;

    const updatePosition = () => {
      const step = tutorialSteps[tutorialStep];
      const targetEl = document.getElementById(step.target);
      
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        let top = rect.bottom + 16;
        let left = rect.left;
        
        if (step.position === 'left') {
          top = rect.top;
          left = rect.left - 320 - 16;
          if (left < 16) left = 16;
        }
        
        setTutorialPos({ top, left, show: true });
      } else {
        setTutorialPos({ 
          top: window.innerHeight / 2 - 100, 
          left: window.innerWidth / 2 - 160, 
          show: true 
        });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [showTutorial, tutorialStep]);

  const nextTutorialStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      setShowTutorial(false);
      setTutorialStep(0);
    }
  };

  const startTutorial = () => {
    setTutorialStep(0);
    setShowTutorial(true);
  };

  const handleGenerateScript = () => {
    const actionLabel = actions.find(a => a.id === selectedAction)?.label || 'Ação';
    const vfxLabel = selectedAction === 'vfx' ? ` (${vfxTypes.find(v => v.id === selectedVfxType)?.label})` : '';
    
    let script = '';
    
    if (selectedEngine === 'csharp') {
      // --- UNITY C# TEMPLATES ---
      switch (selectedAction) {
        case 'idle':
          script = `using UnityEngine;

public class IdleAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    private Animator anim;

    void Start()
    {
        anim = GetComponent<Animator>();
        if (anim != null) anim.Play("Idle");
    }

    void Update()
    {
        if (anim != null) anim.SetFloat("Speed", 0f);
    }
}`;
          break;
        case 'walk':
          script = `using UnityEngine;

[RequireComponent(typeof(Animator))]
public class WalkAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    public float speed = 5f;
    public float gravity = -9.81f;
    private Animator anim;
    private CharacterController controller;
    private Vector3 velocity;

    void Start()
    {
        anim = GetComponent<Animator>();
        controller = GetComponent<CharacterController>();
    }

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        float v = Input.GetAxis("Vertical");
        
        // Fix diagonal speed issue: normalize the movement vector
        Vector3 move = (transform.right * h + transform.forward * v).normalized;
        
        if (controller != null)
        {
            // Apply gravity
            if (controller.isGrounded && velocity.y < 0)
            {
                velocity.y = -2f;
            }
            velocity.y += gravity * Time.deltaTime;

            // Move character
            controller.Move(move * speed * Time.deltaTime);
            controller.Move(velocity * Time.deltaTime);
        }
        else
        {
            transform.Translate(move * speed * Time.deltaTime, Space.World);
        }

        if (anim != null) 
        {
            // Normalize magnitude for blend tree (0 to 1)
            anim.SetFloat("Speed", new Vector2(h, v).magnitude > 0 ? 1f : 0f);
        }
    }
}`;
          break;
        case 'jump':
          script = `using UnityEngine;

[RequireComponent(typeof(Animator))]
public class JumpAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    public float jumpForce = 5f;
    public float gravity = -9.81f;
    
    private CharacterController controller;
    private Animator anim;
    private Vector3 velocity;

    void Start()
    {
        controller = GetComponent<CharacterController>();
        anim = GetComponent<Animator>();
        
        if (controller == null)
            Debug.LogWarning("Slicer.io: CharacterController não encontrado. Pulo desativado.");
    }

    void Update()
    {
        if (controller != null)
        {
            if (controller.isGrounded && velocity.y < 0)
            {
                velocity.y = -2f;
            }

            if (Input.GetButtonDown("Jump") && controller.isGrounded)
            {
                velocity.y = Mathf.Sqrt(jumpForce * -2f * gravity);
            }

            velocity.y += gravity * Time.deltaTime;
            controller.Move(velocity * Time.deltaTime);

            if (anim != null)
            {
                anim.SetBool("isJumping", !controller.isGrounded && velocity.y > 0);
                anim.SetBool("isFalling", !controller.isGrounded && velocity.y < 0);
            }
        }
    }
}`;
          break;
        case 'crouch':
          script = `using UnityEngine;

[RequireComponent(typeof(Animator))]
public class CrouchAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    private Animator anim;
    private CharacterController controller;
    private float originalHeight;

    void Start()
    {
        anim = GetComponent<Animator>();
        controller = GetComponent<CharacterController>();
        if (controller != null) originalHeight = controller.height;
        else Debug.LogWarning("Slicer.io: CharacterController não encontrado. Collider de agachamento desativado.");
    }

    void Update()
    {
        bool isCrouching = Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.C);
        
        if (anim != null) anim.SetBool("IsCrouching", isCrouching);
        
        if (controller != null)
        {
            controller.height = isCrouching ? originalHeight * 0.5f : originalHeight;
            controller.center = isCrouching 
                ? new Vector3(0, originalHeight * 0.25f, 0) 
                : new Vector3(0, originalHeight * 0.5f, 0);
        }
    }
}`;
          break;
        case 'damage':
          script = `using UnityEngine;

[RequireComponent(typeof(Animator))]
public class DamageAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    public int maxHealth = 100;
    private int currentHealth;
    private Animator anim;

    void Start()
    {
        anim = GetComponent<Animator>();
        currentHealth = maxHealth;
        
        if (anim == null)
            Debug.LogWarning("Slicer.io: Animator não encontrado.");
    }

    public void TakeDamage(int amount)
    {
        currentHealth = Mathf.Max(0, currentHealth - amount);
        if (anim != null) anim.SetTrigger("Hit");
        Debug.Log($"Dano recebido: {amount} | HP restante: {currentHealth}");
        
        if (currentHealth <= 0)
        {
            Debug.Log("Personagem morreu!");
            // anim.SetTrigger("Death"); // opcional
        }
    }
}`;
          break;
        case 'attack':
          script = `using UnityEngine;

[RequireComponent(typeof(Animator))]
public class AttackAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    public float attackCooldown = 0.5f;
    public int attackDamage = 10;
    
    private Animator anim;
    private float lastAttackTime;

    void Start()
    {
        anim = GetComponent<Animator>();
        
        if (anim == null)
            Debug.LogWarning("Slicer.io: Animator não encontrado.");
    }

    void Update()
    {
        if (Input.GetButtonDown("Fire1") && Time.time >= lastAttackTime + attackCooldown)
        {
            PerformAttack();
        }
    }

    void PerformAttack()
    {
        lastAttackTime = Time.time;
        if (anim != null) anim.SetTrigger("Attack");
        Debug.Log($"Atacando! Dano: {attackDamage}");
        // Para aplicar dano: obtenha o componente DamageAction3D do inimigo
        // e chame inimigo.GetComponent<DamageAction3D>().TakeDamage(attackDamage);
    }
}`;
          break;
        case 'vfx':
          script = `using UnityEngine;

[RequireComponent(typeof(Animator))]
public class VFXScenarioAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    public ParticleSystem vfxPrefab;
    public Transform spawnPoint;

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.V))
        {
            if (vfxPrefab != null)
            {
                Transform sp = spawnPoint != null ? spawnPoint : transform;
                GameObject vfxInstance = Instantiate(vfxPrefab.gameObject, sp.position, sp.rotation);
                Destroy(vfxInstance, vfxPrefab.main.duration);
                Debug.Log("Efeito VFX ativado!");
            }
            else
            {
                Debug.LogWarning("Slicer.io: VFX Prefab não atribuído no Inspector.");
            }
        }
    }
}`;
          break;
        case 'impact':
          script = `using UnityEngine;

public class VFXImpactAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    public ParticleSystem impactPrefab;

    public void PlayImpact(Vector3 position, Quaternion rotation)
    {
        if (impactPrefab != null)
        {
            GameObject impactInstance = Instantiate(impactPrefab.gameObject, position, rotation);
            Destroy(impactInstance, impactPrefab.main.duration);
            Debug.Log("Efeito de impacto ativado!");
        }
        else
        {
            Debug.LogWarning("Slicer.io: Impact Prefab não atribuído no Inspector.");
        }
    }
    
    // Exemplo de uso em outro script (ex: AttackAction3D):
    // void PerformAttack() {
    //     ...
    //     // No ponto de colisão:
    //     GetComponent<VFXImpactAction3D>().PlayImpact(hitPoint, Quaternion.identity);
    // }
}`;
          break;
        case 'distance':
          script = `using UnityEngine;

public class VFXDistanceAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    public ParticleSystem distancePrefab;
    public Transform target;
    public float maxDistance = 20f;

    // Dispara o efeito em direção a um alvo distante
    // Exemplo: distanceVFX.PlayDistance(targetTransform);
    public void PlayDistance(Transform targetPoint)
    {
        if (distancePrefab == null)
        {
            Debug.LogWarning("Slicer.io: Distance Prefab não atribuído no Inspector.");
            return;
        }

        Vector3 direction = (targetPoint.position - transform.position).normalized;
        float distance = Vector3.Distance(transform.position, targetPoint.position);

        if (distance <= maxDistance)
        {
            Quaternion rotation = Quaternion.LookRotation(direction);
            GameObject vfxInstance = Instantiate(distancePrefab.gameObject, transform.position, rotation);
            Destroy(vfxInstance, distancePrefab.main.duration);
            Debug.Log($"Efeito de Distância ativado! Distância: {distance:F1}m");
        }
        else
        {
            Debug.LogWarning($"Slicer.io: Alvo fora do alcance! Distância: {distance:F1}m / Máximo: {maxDistance}m");
        }
    }
}`;
          break;
        case 'vfx_attack':
          script = `using UnityEngine;

public class VFXAttackAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    public ParticleSystem attackPrefab;
    public Transform attackPoint;

    // Chame este método junto com AttackAction3D
    // Exemplo: attackVFX.PlayAttack();
    public void PlayAttack()
    {
        if (attackPrefab == null)
        {
            Debug.LogWarning("Slicer.io: Attack Prefab não atribuído no Inspector.");
            return;
        }

        Transform spawnPos = attackPoint != null ? attackPoint : transform;
        GameObject vfxInstance = Instantiate(attackPrefab.gameObject, spawnPos.position, spawnPos.rotation);
        Destroy(vfxInstance, attackPrefab.main.duration);
        Debug.Log("Efeito de Ataque ativado!");
    }
}`;
          break;
        default:
          script = `using UnityEngine;\n\npublic class GenericAction3D : MonoBehaviour\n{\n    void Update()\n    {\n        if (Input.GetKeyDown(KeyCode.Space)) Debug.Log("Executando: ${actionLabel}");\n    }\n}`;
      }
    } else {
      // --- JAVASCRIPT / THREE.JS TEMPLATES ---
      switch (selectedAction) {
        case 'idle':
          script = `// idle.js
// Script Gerado pelo Slicer.io - Modo 3D (Three.js)
export class IdleAction3D {
  constructor(mixer, idleClip) {
    this.mixer = mixer;
    this.action = this.mixer.clipAction(idleClip);
  }

  play() {
    this.action.play();
  }

  update(deltaTime) {
    if (this.mixer) this.mixer.update(deltaTime);
  }
}`;
          break;
        case 'walk':
          script = `// walk.js
// Script Gerado pelo Slicer.io - Modo 3D (Three.js)
export class WalkAction3D {
  constructor(model, mixer, walkClip, speed = 5) {
    this.model = model;
    this.mixer = mixer;
    this.action = this.mixer.clipAction(walkClip);
    this.speed = speed;
    this.keys = { w: false, a: false, s: false, d: false };
    this.setupControls();
  }

  setupControls() {
    window.addEventListener('keydown', e => {
      const key = e.key.toLowerCase();
      if (this.keys.hasOwnProperty(key)) this.keys[key] = true;
    });
    window.addEventListener('keyup', e => {
      const key = e.key.toLowerCase();
      if (this.keys.hasOwnProperty(key)) this.keys[key] = false;
    });
  }

  play() {
    this.action.play();
  }

  update(deltaTime) {
    let moved = false;
    if (this.keys.w) { this.model.position.z -= this.speed * deltaTime; moved = true; }
    if (this.keys.s) { this.model.position.z += this.speed * deltaTime; moved = true; }
    if (this.keys.a) { this.model.position.x -= this.speed * deltaTime; moved = true; }
    if (this.keys.d) { this.model.position.x += this.speed * deltaTime; moved = true; }
    
    if (moved && this.mixer) {
      this.mixer.update(deltaTime);
    }
  }
}`;
          break;
        case 'jump':
          script = `// jump.js
// Script Gerado pelo Slicer.io - Modo 3D (Three.js)
export class JumpAction3D {
  constructor(model, jumpForce = 10, gravity = -20) {
    this.model = model;
    this.jumpForce = jumpForce;
    this.gravity = gravity;
    this.velocityY = 0;
    this.isGrounded = true;
    this.setupControls();
  }

  setupControls() {
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && this.isGrounded) {
        this.velocityY = this.jumpForce;
        this.isGrounded = false;
      }
    });
  }

  update(deltaTime) {
    if (!this.isGrounded) {
      this.velocityY += this.gravity * deltaTime;
      this.model.position.y += this.velocityY * deltaTime;
      
      if (this.model.position.y <= 0) {
        this.model.position.y = 0;
        this.isGrounded = true;
        this.velocityY = 0;
      }
    }
  }
}`;
          break;
        case 'crouch':
          script = `// crouch.js
// Script Gerado pelo Slicer.io - Modo 3D (Three.js)
export class CrouchAction3D {
  constructor(model) {
    this.model = model;
    this.originalScaleY = model.scale.y;
    this.setupControls();
  }

  setupControls() {
    window.addEventListener('keydown', e => {
      if (e.code === 'ControlLeft') {
        this.model.scale.y = this.originalScaleY * 0.5;
      }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'ControlLeft') {
        this.model.scale.y = this.originalScaleY;
      }
    });
  }
}`;
          break;
        case 'damage':
          script = `// damage.js
// Script Gerado pelo Slicer.io - Modo 3D (Three.js)
export class DamageAction3D {
  constructor(model) {
    this.model = model;
  }

  takeDamage() {
    this.model.traverse((child) => {
      if (child.isMesh && child.material) {
        // Salva a cor original se ainda não foi salva
        if (!child.userData.originalColor) {
          child.userData.originalColor = child.material.color.getHex();
        }
        
        // Pisca em vermelho
        child.material.color.setHex(0xff0000);
        
        // Restaura a cor após 200ms
        setTimeout(() => {
          if (child.material) {
            child.material.color.setHex(child.userData.originalColor);
          }
        }, 200);
      }
    });
    console.log("Dano recebido!");
  }
}`;
          break;
        case 'attack':
          script = `// attack.js
// Script Gerado pelo Slicer.io - Modo 3D (Three.js)
import * as THREE from 'three';

export class AttackAction3D {
  constructor(mixer, attackClip) {
    this.mixer = mixer;
    this.action = this.mixer.clipAction(attackClip);
    this.action.setLoop(THREE.LoopOnce);
    this.action.clampWhenFinished = true;
    this.setupControls();
  }

  setupControls() {
    window.addEventListener('mousedown', () => this.attack());
  }

  attack() {
    this.action.reset();
    this.action.play();
    console.log("Atacando!");
  }

  update(deltaTime) {
    if (this.mixer) this.mixer.update(deltaTime);
  }
}`;
          break;
        case 'vfx':
          script = `// vfx.js
// Script Gerado pelo Slicer.io - Modo 3D (Three.js)
import * as THREE from 'three';

export class VFXAction3D {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position;
  }

  emit() {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x00ff88, 
      transparent: true,
      opacity: 1
    });
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(this.position);
    this.scene.add(particle);
    
    let startTime = Date.now();
    const animate = () => {
      let elapsed = (Date.now() - startTime) / 1000;
      if (elapsed < 1) {
        particle.scale.multiplyScalar(1.05);
        particle.material.opacity = 1 - elapsed;
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(particle);
        geometry.dispose();
        material.dispose();
      }
    };
    animate();
  }
}`;
          break;
        default:
          script = `// Script Gerado pelo Slicer.io - Modo 3D (Three.js)\nexport function performAction() {\n    console.log("Executando: ${actionLabel}");\n}`;
      }
    }
    
    setGeneratedScript(script);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedScript);
    alert('Código copiado para a área de transferência!');
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([generatedScript], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = selectedEngine === 'csharp' ? "ActionScript.cs" : "ActionScript.js";
    document.body.appendChild(element);
    element.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.glb') || file.name.endsWith('.gltf')) {
        setIsLoading(true);
        const url = URL.createObjectURL(file);
        setModelUrl(url);
        setFileName(file.name);
      } else {
        alert('Por favor, carregue um arquivo .glb ou .gltf');
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      setIsLoading(true);
      const url = URL.createObjectURL(file);
      setModelUrl(url);
      setFileName(file.name);
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-neutral-950">
      {/* Header Section - Fixed at top */}
      <div className="flex-none p-6 flex items-center justify-between border-b border-neutral-900/50 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <Box className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Modo Modelo 3D</h2>
            <p className="text-xs text-neutral-500 font-mono">Visualizador de Assets Tridimensionais</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 rounded-lg transition-colors ${showGrid ? 'bg-emerald-500/20 text-emerald-500' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
            title="Alternar Grade"
          >
            <Grid3X3 className="w-5 h-5" />
          </button>
          <button 
            onClick={startTutorial}
            className="p-2 rounded-lg bg-neutral-900 text-neutral-400 hover:bg-neutral-800 transition-colors"
            title="Tutorial"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button 
            onClick={() => {
              setModelUrl(null);
              setIsLoading(false);
              setFileName(null);
              setGeneratedScript('');
              setSelectedAction('');
              setSelectedEngine('');
            }}
            className="p-2 rounded-lg bg-neutral-900 text-neutral-400 hover:bg-neutral-800 transition-colors"
            title="Resetar Tudo"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 lg:p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
          {/* Right: 3D Canvas & Code Display (Order 1 on mobile) */}
          <div className="w-full lg:flex-1 flex flex-col gap-8 order-1 lg:order-2">
            <div className="w-full h-[500px] lg:h-[600px] bg-neutral-900 border-2 border-emerald-500/50 rounded-3xl overflow-hidden relative shadow-[0_0_30px_rgba(16,185,129,0.1)]">
              <div className="absolute top-4 left-4 z-10 text-[10px] font-mono text-emerald-500 font-bold bg-black/80 px-3 py-1.5 rounded-full border border-emerald-500/20">
                SISTEMA 3D ATIVO
              </div>
              <Loading isLoading={isLoading && !!modelUrl} />
              
              <Canvas 
                shadows
                gl={{ 
                  antialias: true, 
                  toneMapping: THREE.ACESFilmicToneMapping,
                  outputColorSpace: THREE.SRGBColorSpace,
                }}
                onCreated={({ gl }) => {
                  gl.shadowMap.type = THREE.PCFShadowMap;
                }}
                camera={{ position: [8, 8, 8], fov: 45 }}
              >
                <SceneContent 
                  modelUrl={modelUrl} 
                  showGrid={showGrid} 
                  onModelLoad={() => setIsLoading(false)} 
                />
                <ambientLight intensity={0.7} />
                <pointLight position={[10, 10, 10]} intensity={1.5} />
                <directionalLight position={[-5, 5, 5]} intensity={1} castShadow />
              </Canvas>
              
              {!modelUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-neutral-700 pointer-events-none">
                  <div className="w-20 h-20 border-2 border-neutral-800 rounded-3xl flex items-center justify-center opacity-20">
                    <Box className="w-10 h-10" />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest opacity-30">Aguardando Modelo 3D...</p>
                </div>
              )}
              
              <div className="absolute bottom-4 right-4 flex gap-2">
                 <div className="px-3 py-1 bg-neutral-950/80 backdrop-blur border border-neutral-800 rounded-full text-[10px] font-bold text-neutral-500 uppercase flex items-center gap-2">
                   <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                   Render Engine: Three.js r{THREE.REVISION}
                 </div>
              </div>
            </div>

            {/* Code Display Area */}
            {generatedScript && (
              <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-500 min-h-[400px]">
                <div className="flex-none h-12 border-b border-neutral-800 bg-neutral-950/50 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                      {selectedEngine === 'csharp' ? 'C# Unity Script' : 'JavaScript Script'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleCopy}
                      className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                      title="Copiar Código"
                    >
                      <Maximize2 className="w-3.5 h-3.5 rotate-45" />
                    </button>
                    <button 
                      onClick={handleDownload}
                      className="p-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 transition-colors"
                      title="Baixar Arquivo"
                    >
                      <Upload className="w-3.5 h-3.5 rotate-180" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-hidden min-h-[350px]">
                  <textarea 
                    value={generatedScript}
                    onChange={(e) => setGeneratedScript(e.target.value)}
                    className="w-full h-full min-h-[300px] bg-transparent text-emerald-500/90 font-mono text-xs resize-none focus:outline-none scrollbar-thin scrollbar-thumb-neutral-800"
                    spellCheck={false}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Left: Controls & Info (Order 2 on mobile) */}
          <div className="w-full lg:w-80 flex flex-col gap-6 flex-none order-2 lg:order-1">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Upload de Modelo</h3>
              
              <div 
                id="tutorial-3d-upload"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-neutral-800 hover:border-emerald-500/50 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all bg-neutral-950/50 group"
              >
                <div className="w-12 h-12 bg-neutral-900 rounded-full flex items-center justify-center text-neutral-500 group-hover:text-emerald-500 transition-colors">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-neutral-300">Clique ou Arraste</p>
                  <p className="text-[10px] text-neutral-500 mt-1">Suporta .GLB, .GLTF</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".glb,.gltf"
                  className="hidden"
                />
              </div>

              {fileName && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded flex items-center justify-center text-emerald-500">
                    <Box className="w-4 h-4" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-bold text-emerald-500 truncate">{fileName}</p>
                    <p className="text-[10px] text-emerald-500/60 uppercase">Carregado com sucesso</p>
                  </div>
                </div>
              )}
            </div>

          {/* Etapa 1: Seletor de Ação */}
          <div id="tutorial-3d-action" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center text-[10px] font-black">1</span>
              Tipo de Ação
            </h3>
            
            <div className="space-y-2">
              <select 
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value);
                  if (e.target.value !== 'vfx') setSelectedVfxType('');
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors appearance-none cursor-pointer"
              >
                <option value="" disabled>Selecione uma ação...</option>
                {actions.map(action => (
                  <option key={action.id} value={action.id}>{action.label}</option>
                ))}
              </select>
            </div>

            {/* Etapa 1.5: Subtipo VFX */}
            {selectedAction === 'vfx' && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider ml-1">
                  Subtipo de Efeito
                </label>
                <select 
                  value={selectedVfxType}
                  onChange={(e) => setSelectedVfxType(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-emerald-500 focus:outline-none focus:border-emerald-500/50 transition-colors appearance-none cursor-pointer"
                >
                  <option value="" disabled>Escolha o tipo de VFX...</option>
                  {vfxTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Etapa 2: Engine */}
          {selectedAction && (
            <div id="tutorial-3d-engine" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col gap-4 animate-in slide-in-from-top-2 duration-300">
              <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center text-[10px] font-black">2</span>
                Engine / Linguagem
              </h3>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setSelectedEngine('csharp')}
                  className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border ${selectedEngine === 'csharp' ? 'bg-emerald-500 border-emerald-500 text-neutral-950' : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'}`}
                >
                  C# Unity
                </button>
                <button 
                  onClick={() => setSelectedEngine('js')}
                  className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border ${selectedEngine === 'js' ? 'bg-emerald-500 border-emerald-500 text-neutral-950' : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'}`}
                >
                  JavaScript
                </button>
              </div>
            </div>
          )}

          {/* Etapa 3: Gerar */}
          {selectedEngine && (
            <div id="tutorial-3d-generate" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col gap-4 animate-in slide-in-from-top-2 duration-300">
              <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center text-[10px] font-black">3</span>
                Gerar Script
              </h3>
              
              <button 
                onClick={handleGenerateScript}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] active:scale-95"
              >
                GERAR SCRIPT
              </button>
            </div>
          )}

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-4">Instruções</h3>
            <ul className="space-y-3 text-xs text-neutral-500">
              <li className="flex gap-2">
                <span className="text-emerald-500">●</span>
                Botão Esquerdo: Rotacionar
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500">●</span>
                Scroll: Zoom In/Out
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500">●</span>
                Botão Direito: Pan
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Tutorial Overlay */}
      {showTutorial && tutorialPos.show && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={() => setShowTutorial(false)} />
          
          <div 
            className="absolute z-50 w-80 bg-neutral-900 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl shadow-emerald-500/10 pointer-events-auto transition-all duration-300"
            style={{ 
              top: `${tutorialPos.top}px`, 
              left: `${tutorialPos.left}px`,
              transform: 'translateY(0)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-emerald-500 font-bold text-lg">{tutorialSteps[tutorialStep].title}</h3>
              <span className="text-xs font-mono text-neutral-500 bg-neutral-950 px-2 py-1 rounded-md border border-neutral-800">
                {tutorialStep + 1} / {tutorialSteps.length}
              </span>
            </div>
            
            <p className="text-neutral-300 text-sm leading-relaxed mb-6">
              {tutorialSteps[tutorialStep].content}
            </p>
            
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setShowTutorial(false)}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                Pular tutorial
              </button>
              
              <button 
                onClick={nextTutorialStep}
                className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-sm font-bold px-4 py-2 rounded-lg transition-colors"
              >
                {tutorialStep === tutorialSteps.length - 1 ? 'Concluir' : 'Próximo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}
