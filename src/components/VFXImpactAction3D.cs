using UnityEngine;

public class VFXImpactAction3D : MonoBehaviour
{
    // Script Gerado pelo Slicer.io - Modo 3D (Unity)
    public ParticleSystem impactPrefab;

    // Chame este método a partir de outros scripts (ex: AttackAction3D)
    // Exemplo: impactVFX.PlayImpact(hitPoint, Quaternion.identity);
    public void PlayImpact(Vector3 position, Quaternion rotation)
    {
        if (impactPrefab != null)
        {
            GameObject vfxInstance = Instantiate(impactPrefab.gameObject, position, rotation);
            Destroy(vfxInstance, impactPrefab.main.duration);
            Debug.Log("Efeito de Impacto ativado!");
        }
        else
        {
            Debug.LogWarning("Slicer.io: Impact Prefab não atribuído no Inspector.");
        }
    }
}
