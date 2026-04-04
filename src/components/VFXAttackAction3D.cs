using UnityEngine;

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
}
