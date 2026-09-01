<script lang="ts">
	let { size = 38 }: { size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 48 48"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
>
	<rect width="48" height="48" rx="14" fill="#E6B85C" />
	<path
		d="M15 17.5v13M21 13v22M27 18v12M33 15.5v17"
		stroke="#15191E"
		stroke-width="3.2"
		stroke-linecap="round"
	/>
	<circle cx="24" cy="24" r="18.25" stroke="#15191E" stroke-opacity=".12" stroke-width="1.5" />
</svg>
