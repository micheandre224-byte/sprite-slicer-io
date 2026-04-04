export const baseScripts: Record<string, string> = {
  walk: `using UnityEngine;

[RequireComponent(typeof(Animator))]
[RequireComponent(typeof(CharacterController))]
public class WalkAction3D : MonoBehaviour
{
    [Header("Movement Settings")]
    [SerializeField] private float walkSpeed = 4f;
    [SerializeField] private float runSpeed = 7f;
    [SerializeField] private float gravity = -9.81f;

    [Header("Animation")]
    [SerializeField] private string speedParameter = "Speed";
    [SerializeField] private float animationDampTime = 0.15f;

    private Animator anim;
    private CharacterController controller;
    private Vector3 velocity;

    private void Start()
    {
        anim = GetComponent<Animator>();
        controller = GetComponent<CharacterController>();

        if (anim == null)
            Debug.LogWarning("[Slicer.io] Animator não encontrado em " + gameObject.name);

        if (controller == null)
            Debug.LogWarning("[Slicer.io] CharacterController não encontrado em " + gameObject.name);
    }

    private void Update()
    {
        float h = Input.GetAxisRaw("Horizontal");
        float v = Input.GetAxisRaw("Vertical");

        Vector3 move = transform.right * h + transform.forward * v;
        move = move.normalized;

        bool isRunning = Input.GetKey(KeyCode.LeftShift);
        float currentSpeed = isRunning ? runSpeed : walkSpeed;

        // Movimento horizontal
        if (controller.isGrounded)
        {
            velocity.x = move.x * currentSpeed;
            velocity.z = move.z * currentSpeed;
        }

        // Gravidade
        if (!controller.isGrounded)
        {
            velocity.y += gravity * Time.deltaTime;
        }
        else if (velocity.y < 0)
        {
            velocity.y = -2f; // leve pressão no chão
        }

        controller.Move(velocity * Time.deltaTime);

        // Animação suave
        float speedMagnitude = move.magnitude * (isRunning ? 1f : 0.5f);
        if (anim != null)
        {
            anim.SetFloat(speedParameter, speedMagnitude, animationDampTime, Time.deltaTime);
        }
    }
}`,
  attack: `using UnityEngine;

[RequireComponent(typeof(Animator))]
public class AttackAction3D : MonoBehaviour
{
    [Header("Attack Settings")]
    [SerializeField] private KeyCode attackKey = KeyCode.Mouse0;
    [SerializeField] private float attackCooldown = 0.5f;
    [SerializeField] private int attackDamage = 10;

    [Header("Animation")]
    [SerializeField] private string attackTrigger = "Attack";

    private Animator anim;
    private float nextAttackTime = 0f;

    private void Start()
    {
        anim = GetComponent<Animator>();

        if (anim == null)
            Debug.LogWarning("[Slicer.io] Animator não encontrado em " + gameObject.name);
    }

    private void Update()
    {
        if (Input.GetKeyDown(attackKey) && Time.time >= nextAttackTime)
        {
            PerformAttack();
        }
    }

    private void PerformAttack()
    {
        nextAttackTime = Time.time + attackCooldown;

        if (anim != null)
        {
            anim.SetTrigger(attackTrigger);
        }

        Debug.Log($"[Slicer.io] Atacando! Dano: {attackDamage}");
        
        // Exemplo de integração com hitbox/dano:
        // RaycastHit hit;
        // if (Physics.Raycast(transform.position, transform.forward, out hit, 2f))
        // {
        //     HurtAction3D target = hit.collider.GetComponent<HurtAction3D>();
        //     if (target != null) target.TakeDamage(attackDamage);
        // }
    }
}`,
  hurt: `using UnityEngine;

[RequireComponent(typeof(Animator))]
public class HurtAction3D : MonoBehaviour
{
    [Header("Health Settings")]
    [SerializeField] private int maxHealth = 100;
    private int currentHealth;

    [Header("Hurt Settings")]
    [SerializeField] private float invincibilityDuration = 1f;
    [SerializeField] private float knockbackForce = 5f;

    [Header("Animation")]
    [SerializeField] private string hurtTrigger = "Hurt";
    [SerializeField] private string dieTrigger = "Die";

    private Animator anim;
    private CharacterController controller;
    private float invincibilityEndTime = 0f;
    private bool isDead = false;

    private void Start()
    {
        anim = GetComponent<Animator>();
        controller = GetComponent<CharacterController>();
        currentHealth = maxHealth;

        if (anim == null)
            Debug.LogWarning("[Slicer.io] Animator não encontrado em " + gameObject.name);
    }

    public void TakeDamage(int damageAmount, Vector3 hitDirection = default)
    {
        if (isDead || Time.time < invincibilityEndTime) return;

        currentHealth -= damageAmount;
        invincibilityEndTime = Time.time + invincibilityDuration;

        if (currentHealth <= 0)
        {
            currentHealth = 0;
            Die();
        }
        else
        {
            if (anim != null) anim.SetTrigger(hurtTrigger);
            ApplyKnockback(hitDirection);
            Debug.Log($"[Slicer.io] Recebeu {damageAmount} de dano. Vida restante: {currentHealth}");
        }
    }

    private void ApplyKnockback(Vector3 direction)
    {
        if (controller != null && direction != default)
        {
            // Aplica um knockback simples (requer lógica adicional no Update para suavizar)
            controller.Move(direction.normalized * knockbackForce * Time.deltaTime);
        }
    }

    private void Die()
    {
        isDead = true;
        if (anim != null) anim.SetTrigger(dieTrigger);
        Debug.Log("[Slicer.io] Personagem morreu.");
        // Lógica adicional de morte (desativar controles, etc)
    }
}`,
  vfx: `using UnityEngine;

public class VFXAction3D : MonoBehaviour
{
    [Header("VFX Settings")]
    [SerializeField] private ParticleSystem vfxPrefab;
    [SerializeField] private Transform spawnPoint;
    [SerializeField] private KeyCode activationKey = KeyCode.V;

    [Header("Billboard Settings")]
    [SerializeField] private bool faceCamera = false;

    private Camera mainCamera;

    private void Start()
    {
        mainCamera = Camera.main;
        if (vfxPrefab == null)
            Debug.LogWarning("[Slicer.io] VFX Prefab não atribuído em " + gameObject.name);
    }

    private void Update()
    {
        if (Input.GetKeyDown(activationKey))
        {
            PlayVFX();
        }

        if (faceCamera && mainCamera != null)
        {
            transform.LookAt(transform.position + mainCamera.transform.rotation * Vector3.forward,
                             mainCamera.transform.rotation * Vector3.up);
        }
    }

    public void PlayVFX()
    {
        if (vfxPrefab != null)
        {
            Transform sp = spawnPoint != null ? spawnPoint : transform;
            GameObject vfxInstance = Instantiate(vfxPrefab.gameObject, sp.position, sp.rotation);
            Destroy(vfxInstance, vfxPrefab.main.duration);
            Debug.Log("[Slicer.io] Efeito VFX ativado!");
        }
    }
}`,
  idle: `using UnityEngine;

[RequireComponent(typeof(Animator))]
public class IdleAction3D : MonoBehaviour
{
    [Header("Idle Settings")]
    [SerializeField] private float minTimeBetweenRandoms = 5f;
    [SerializeField] private float maxTimeBetweenRandoms = 15f;

    [Header("Animation")]
    [SerializeField] private string randomIdleTrigger = "RandomIdle";

    private Animator anim;
    private float nextRandomIdleTime;

    private void Start()
    {
        anim = GetComponent<Animator>();

        if (anim == null)
            Debug.LogWarning("[Slicer.io] Animator não encontrado em " + gameObject.name);

        ScheduleNextRandomIdle();
    }

    private void Update()
    {
        // Verifica se o personagem está parado (exemplo simples)
        // Em um jogo real, você checaria a velocidade do CharacterController
        bool isMoving = Input.GetAxisRaw("Horizontal") != 0 || Input.GetAxisRaw("Vertical") != 0;

        if (!isMoving && Time.time >= nextRandomIdleTime)
        {
            PlayRandomIdle();
            ScheduleNextRandomIdle();
        }
        else if (isMoving)
        {
            // Adia o idle aleatório se estiver se movendo
            ScheduleNextRandomIdle();
        }
    }

    private void PlayRandomIdle()
    {
        if (anim != null)
        {
            anim.SetTrigger(randomIdleTrigger);
            Debug.Log("[Slicer.io] Random Idle ativado!");
        }
    }

    private void ScheduleNextRandomIdle()
    {
        nextRandomIdleTime = Time.time + Random.Range(minTimeBetweenRandoms, maxTimeBetweenRandoms);
    }
}`
};
