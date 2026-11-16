from pathlib import Path

import yaml

COMPOSE_FILE = Path(__file__).resolve().parents[2] / "compose.yaml"


def test_compose_publishes_every_port_on_loopback_only() -> None:
    compose_config = yaml.safe_load(COMPOSE_FILE.read_text(encoding="utf-8"))

    published_ports = [
        (service_name, port_mapping)
        for service_name, service_config in compose_config["services"].items()
        for port_mapping in service_config.get("ports", [])
    ]

    assert {service_name for service_name, _ in published_ports} == {"postgres", "backend", "frontend"}
    assert [
        (service_name, port_mapping)
        for service_name, port_mapping in published_ports
        if not port_mapping.startswith("127.0.0.1:")
    ] == []
