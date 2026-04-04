using UnityEngine;

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
}
